import * as xb from 'xrblocks';
import {
  BroadcastChannelTransport,
  WebRTCTransport,
  WebSocketTransport,
  enableNet,
  generateRoomCode,
  normalizeRoomCode,
} from 'xrblocks/addons/netblocks/src/index.js';
import {RoomcraftNet} from 'xrblocks/addons/roomcraft/index.js';
import {CollaborationSpatialView} from './CollaborationSpatial.js';
import {CollaborationDiagnostics} from './CollaborationDiagnostics.js';

const DEFAULT_ROOM = 'roomcraft-demo';
const RETRY_MESSAGE = 'Retrying collaboration sync.';

function setProperty(target, property, value) {
  if (target[property] !== value) target[property] = value;
}

function setAttribute(target, property, value) {
  const text = String(value);
  if (target.getAttribute(property) !== text)
    target.setAttribute(property, text);
}
const TRANSPORTS = {
  broadcast: {
    label: 'same-browser collaboration',
    help: 'BroadcastChannel needs the same browser profile and exact origin (scheme, host and port). It cannot connect another device.',
  },
  webrtc: {
    label: 'WebRTC collaboration',
    help: 'Cross-device / off-LAN via the existing public PeerJS broker and STUN. Best-effort, rate-limited, up to 12 peers. NAT/firewalls can block connections; no TURN is configured. Use the same code and transport; either view can join.',
  },
  websocket: {
    label: 'WebSocket relay collaboration',
    help: 'Provide an existing netblocks-compatible relay reachable by every peer. HTTPS pages require WSS and a trusted certificate. The relay receives shared scene data; no relay is hosted by this demo.',
  },
};

function readableName(value) {
  return (value ?? '')
    .replace(/[\p{Cc}\u202a-\u202e\u2066-\u2069]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40);
}

/** Relay links deliberately cannot carry credentials, queries or fragments. */
export function collaborationRelayUrl(value, pageUrl) {
  let relay;
  try {
    relay = new URL(value);
  } catch {
    throw new Error('Enter an explicit ws:// or wss:// relay URL.');
  }
  if (!['ws:', 'wss:'].includes(relay.protocol)) {
    throw new Error('The relay URL must use ws:// or wss://.');
  }
  if (new URL(pageUrl).protocol === 'https:' && relay.protocol !== 'wss:') {
    throw new Error('HTTPS pages require a secure wss:// relay URL.');
  }
  if (relay.username || relay.password || relay.search || relay.hash) {
    throw new Error(
      'Use a relay URL without credentials, query parameters or fragments. Never put keys in shared links.'
    );
  }
  return relay.href;
}

function connectionOptions(source) {
  const transport =
    source.searchParams.get('transport') ||
    (source.searchParams.get('lobby') === '1' ? 'webrtc' : 'broadcast');
  if (!Object.hasOwn(TRANSPORTS, transport)) {
    throw new Error('Choose BroadcastChannel, WebRTC or WebSocket.');
  }
  return {
    transport,
    relay:
      transport === 'websocket'
        ? collaborationRelayUrl(source.searchParams.get('relay') || '', source)
        : '',
  };
}

function sharedRoomId(room) {
  return room ? `roomcraft:shared:${room}` : '';
}

/** Bound the optional room and display name without changing page mode. */
export function collaborationOptions(url, virtual = false) {
  const source = new URL(url);
  if (source.searchParams.get('collab') !== '1') return null;
  const requestedRoom = source.searchParams.get('room')?.trim() ?? '';
  if (
    requestedRoom &&
    !/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,47}$/.test(requestedRoom)
  ) {
    throw new Error(
      'Room IDs need 1 to 48 letters, digits, underscores, or hyphens, starting with a letter or digit.'
    );
  }
  const lobby = source.searchParams.get('lobby') === '1';
  if (lobby && requestedRoom && !normalizeRoomCode(requestedRoom))
    throw new Error('Enter the four-letter room code.');
  const room = requestedRoom
    ? lobby
      ? normalizeRoomCode(requestedRoom)
      : requestedRoom
    : lobby
      ? ''
      : DEFAULT_ROOM;
  const displayName =
    readableName(source.searchParams.get('name')) ||
    `Maker ${crypto.getRandomValues(new Uint16Array(1))[0].toString(16).padStart(4, '0')}`;
  const connection = connectionOptions(source);
  return {
    room,
    roomId: sharedRoomId(room),
    displayName,
    virtual,
    seedLocalScene: !(
      room &&
      (lobby || (connection.transport === 'webrtc' && /^[A-Z]{4}$/.test(room)))
    ),
    ...connection,
  };
}

/** Build from an allowlist, not a copied query: even nested key URLs stay out. */
export function collaborationPeerUrl(url, options) {
  const source = new URL(url);
  const peer = new URL(source.pathname, source.origin);
  peer.searchParams.set('collab', '1');
  peer.searchParams.set('room', options.room);
  if (options.transport && options.transport !== 'broadcast') {
    if (!Object.hasOwn(TRANSPORTS, options.transport)) {
      throw new Error('Unknown collaboration transport.');
    }
    peer.searchParams.set('transport', options.transport);
    if (options.transport === 'websocket') {
      peer.searchParams.set(
        'relay',
        collaborationRelayUrl(options.relay, source)
      );
    }
  }
  if (options.virtual) peer.searchParams.set('environment', '1');
  if (source.searchParams.get('formFactor') === 'desktop') {
    peer.searchParams.set('formFactor', 'desktop');
  }
  for (const flag of ['debug', 'xrAutomation']) {
    if (source.searchParams.get(flag) === '1') peer.searchParams.set(flag, '1');
  }
  return peer.href;
}

/** One state/action controller for the DOM and spatial collaboration views. */
class Collaboration {
  constructor(room, consoleScript, options, url) {
    this.room = room;
    this.consoleScript = consoleScript;
    this.options = options;
    this.url = url;
    this.cleanups = [];
    this.disposed = false;
    this.failure = '';
    this.failureOperation = '';
    this.failureFromBridge = false;
    this.voiceFailure = '';
    this.voiceRequest = 0;
    this.voicePending = false;
    this.playbackMuted = false;
    this.joinCode = '';
    this.roomNotice = '';
    this.hasConnected = false;
    this.roomActionHadFocus = false;
    this.retryHadFocus = false;
    this.diagnosticLog = new CollaborationDiagnostics();
    this.diagnosticNotice = '';
    this.diagnosticCopying = false;
    this.sessionNumber = 0;
    this.draft = {
      name: options.displayName,
      transport: options.transport,
      relay: options.relay,
    };
    this.subscribers = new Set();
    this.rows = new Map();
    this.lastStateKey = '';
    this.lastBusy = undefined;
    this.dom = Object.fromEntries(
      [
        'collaboration',
        'collabStatus',
        'collabIdentity',
        'collabPeers',
        'collabRetry',
        'collabLink',
        'collabConnection',
        'collabSettings',
        'collabDraftIndicator',
        'collabDraftStatus',
        'collabReset',
        'collabTransport',
        'collabTransportHelp',
        'collabRelayField',
        'collabRelay',
        'collabName',
        'collabConnect',
        'collabLeave',
        'collabVoice',
        'collabVoiceStatus',
        'collabPlayback',
        'collabPlaybackStatus',
        'collabRoomCode',
        'collabRoomNotice',
        'collabStartRoom',
        'collabJoinForm',
        'collabJoinCode',
        'collabJoinRoom',
        'collabCopyCode',
        'collabRooms',
        'collabRoomsSummary',
        'collabLobbyName',
        'collabActions',
        'collabDiagnostics',
        'collabDiagnosticsSummary',
        'collabDiagnosticsHistory',
        'collabDiagnosticsNotice',
        'collabDiagnosticsCopy',
        'collabDiagnosticsDownload',
        'collabDiagnosticsRefresh',
      ].map((id) => [id, document.getElementById(id)])
    );
    this.dom.collaboration.hidden = false;
    this.render();
    this.listen(this.dom.collabRetry, 'click', () => void this.retry());
    this.listen(this.dom.collabTransport, 'change', () =>
      this.setDraft('transport', this.dom.collabTransport.value)
    );
    this.listen(this.dom.collabName, 'input', () =>
      this.setDraft('name', this.dom.collabName.value)
    );
    this.listen(this.dom.collabRelay, 'input', () =>
      this.setDraft('relay', this.dom.collabRelay.value)
    );
    this.listen(this.dom.collabConnection, 'submit', (event) => {
      event.preventDefault();
      void this.reconnect();
    });
    this.listen(this.dom.collabReset, 'click', () => this.resetDraft());
    this.listen(this.dom.collabLeave, 'click', () => this.leave());
    this.listen(this.dom.collabVoice, 'click', () => void this.toggleVoice());
    this.listen(this.dom.collabPlayback, 'click', () => this.togglePlayback());
    this.listen(this.dom.collabStartRoom, 'click', () => void this.startRoom());
    this.listen(this.dom.collabJoinCode, 'input', () =>
      this.setJoinCode(this.dom.collabJoinCode.value)
    );
    this.listen(this.dom.collabJoinForm, 'submit', (event) => {
      event.preventDefault();
      void this.joinRoom();
    });
    this.listen(this.dom.collabCopyCode, 'click', () => void this.copyCode());
    this.listen(this.dom.collabLobbyName, 'input', () =>
      this.setDraft('name', this.dom.collabLobbyName.value)
    );
    this.listen(
      this.dom.collabDiagnosticsCopy,
      'click',
      () => void this.copyDiagnostics()
    );
    this.listen(this.dom.collabDiagnosticsDownload, 'click', () =>
      this.downloadDiagnostics()
    );
    this.listen(this.dom.collabDiagnosticsRefresh, 'click', () =>
      this.refreshDiagnostics()
    );
    this.listen(document, 'visibilitychange', () => this.render());
    this.listen(xb.core.renderer.xr, 'sessionstart', () => this.render());
    this.listen(xb.core.renderer.xr, 'sessionend', () => this.render());
    this.listen(window, 'pagehide', () => this.dispose());
    this.listen(room, 'change', () => this.renderRoster());
    this.listen(room, 'selectionchange', () => this.renderRoster());
    this.listen(room, 'statuschange', () => this.render());
  }

  get session() {
    return this.connection?.session;
  }

  get bridge() {
    return this.connection?.bridge;
  }

  get joining() {
    return this.connection?.joining ?? false;
  }

  mountSpatial() {
    if (!this.spatial && !this.disposed) {
      this.spatial = new CollaborationSpatialView(this.consoleScript, this);
    }
  }

  subscribe(listener) {
    this.subscribers.add(listener);
    listener(this.getState());
    return () => this.subscribers.delete(listener);
  }

  setDraft(field, value) {
    if (!Object.hasOwn(this.draft, field) || typeof value !== 'string') {
      throw new Error('Invalid collaboration setting.');
    }
    if (field === 'transport' && !Object.hasOwn(TRANSPORTS, value)) {
      throw new Error('Choose BroadcastChannel, WebRTC or WebSocket.');
    }
    if (this.draft[field] === value) return;
    this.draft[field] = value;
    this.render();
  }

  setJoinCode(value) {
    if (typeof value !== 'string') throw new Error('Enter a room code.');
    this.joinCode = value.toUpperCase().replace(/[^A-Z]/g, '');
    this.roomNotice = '';
    this.render();
  }

  startRoom() {
    return this.joinRoom(generateRoomCode(), {seedLocalScene: true});
  }

  isCurrentRoom(code, name) {
    return (
      !!this.connection?.ready &&
      !!this.session?.isOpen &&
      this.options.transport === 'webrtc' &&
      this.options.room === code &&
      this.options.displayName === readableName(name)
    );
  }

  async joinRoom(value = this.joinCode, {seedLocalScene = false} = {}) {
    if (this.disposed || this.room.busy || this.joining) return;
    try {
      const code = normalizeRoomCode(value);
      if (!code) throw new Error('Enter the four-letter room code.');
      const displayName = readableName(this.draft.name);
      if (!displayName)
        throw new Error('Enter the name you want to use when joining.');
      if (this.isCurrentRoom(code, displayName)) return;
      this.releaseSession();
      this.clearFailure();
      this.options = {
        ...this.options,
        room: code,
        roomId: sharedRoomId(code),
        displayName,
        transport: 'webrtc',
        relay: '',
        seedLocalScene,
      };
      this.draft = {name: displayName, transport: 'webrtc', relay: ''};
      this.joinCode = code;
      this.roomNotice = '';
      await this.start();
    } catch (error) {
      this.reportError(error, 'room');
    }
  }

  async copyCode() {
    const code = this.getState().rooms.code;
    if (this.disposed || !code) return;
    try {
      if (!navigator.clipboard?.writeText)
        throw new Error(
          'Copy is unavailable in this browser. Share the displayed room code instead.'
        );
      await navigator.clipboard.writeText(code);
      if (!this.disposed && this.options.room === code) {
        this.roomNotice = `Copied ${code}. Anyone can join this code from either view.`;
        this.render();
      }
    } catch (error) {
      if (!this.disposed && this.options.room === code)
        this.reportError(error, 'copy room code');
    }
  }

  resetDraft() {
    if (this.disposed) return;
    this.draft = {
      name: this.options.displayName,
      transport: this.options.transport,
      relay: this.options.relay,
    };
    if (this.failureOperation === 'configuration') {
      this.clearFailure();
      this.consoleScript.setStatus(
        'Unapplied connection changes discarded. Connection, scene, prompt and audio are unchanged.'
      );
    }
    this.render();
  }

  diagnosticsView() {
    return {
      summary: this.diagnosticLog.summary,
      recent: this.diagnosticLog.recent,
      events: this.diagnosticLog.events.length,
      notice: this.diagnosticNotice,
      copying: this.diagnosticCopying,
      disabled: this.disposed,
    };
  }

  refreshDiagnostics() {
    if (!this.disposed) this.render();
  }

  async copyDiagnostics() {
    if (this.disposed || this.diagnosticCopying) return;
    this.diagnosticCopying = true;
    this.diagnosticNotice = '';
    this.render();
    try {
      if (!navigator.clipboard?.writeText)
        throw new Error('Clipboard unavailable');
      await navigator.clipboard.writeText(
        JSON.stringify(this.diagnosticLog.report(), null, 2)
      );
      if (!this.disposed)
        this.diagnosticNotice =
          'Diagnostics copied. Share reports from both devices for comparison.';
    } catch {
      if (!this.disposed)
        this.diagnosticNotice =
          'Copy unavailable. Use Download diagnostics in the browser controls, or photograph this panel.';
    } finally {
      this.diagnosticCopying = false;
      if (!this.disposed) this.render();
    }
  }

  downloadDiagnostics() {
    if (this.disposed) return;
    this.render();
    let url;
    try {
      url = URL.createObjectURL(
        new Blob([JSON.stringify(this.diagnosticLog.report(), null, 2)], {
          type: 'application/json',
        })
      );
      const link = document.createElement('a');
      link.href = url;
      link.download = 'roomcraft-diagnostics.json';
      link.click();
      this.diagnosticNotice =
        'Diagnostics downloaded. The report stays local until you share it.';
    } catch {
      this.diagnosticNotice =
        'Download unavailable. Copy diagnostics or photograph this panel instead.';
    } finally {
      if (url) URL.revokeObjectURL(url);
      this.render();
    }
  }

  updateIdentity() {
    this.render();
  }

  get busy() {
    return (
      !this.disposed &&
      (this.joining ||
        this.bridge?.status === 'syncing' ||
        (this.bridge?.status !== 'error' &&
          (this.bridge?.pendingCount ?? 0) > 0))
    );
  }

  listen(target, type, listener, cleanups = this.cleanups) {
    target.addEventListener(type, listener);
    cleanups.push(() => target.removeEventListener(type, listener));
  }

  async start() {
    if (this.disposed || this.joining || !this.options.room) return;
    const connection = {joining: true, cleanups: [], ready: false};
    this.sessionNumber++;
    this.connection = connection;
    const current = () => !this.disposed && this.connection === connection;
    this.render();
    try {
      connection.net = enableNet();
      connection.transport =
        this.options.transport === 'webrtc'
          ? new WebRTCTransport()
          : this.options.transport === 'websocket'
            ? new WebSocketTransport({
                url: this.options.relay,
                reconnectAttempts: 0,
              })
            : new BroadcastChannelTransport();
      const listen = (target, type, listener) =>
        this.listen(target, type, listener, connection.cleanups);
      listen(connection.transport, 'error', (event) => {
        if (current()) this.reportError(event.detail.error, 'transport');
      });
      // NetCore returns its mutable current session after awaiting open().
      // Capture ours before awaiting: a newer join must never be closed by
      // an old completion. Some transports cannot abort an in-flight open.
      const joined = connection.net.joinRoom(this.options.roomId, {
        transport: connection.transport,
        displayName: this.options.displayName,
        role: 'user',
      });
      connection.session = connection.net.session;
      connection.session?.setPlaybackMuted(this.playbackMuted);
      await joined;
      if (!current()) return;
      const session = connection.session;
      connection.bridge = new RoomcraftNet(this.room, session, {
        roomId: this.options.roomId,
        seedLocalScene: this.options.seedLocalScene,
      });
      listen(session, 'user-join', () => this.renderRoster());
      listen(session, 'user-update', () => this.renderRoster());
      listen(session, 'user-leave', () => this.renderRoster());
      listen(session, 'local-voice-state', () => {
        this.renderVoice();
        this.renderRoster();
      });
      listen(session, 'peer-voice-state', () => this.renderRoster());
      listen(session, 'playback-state', () => {
        this.playbackMuted = session.playbackMuted;
        this.render();
      });
      listen(session, 'voice-error', (event) => {
        this.voiceFailure = `Peer voice: ${event.detail.error.message}`;
        this.renderVoice();
      });
      listen(session, 'close', () => {
        if (!current()) return;
        this.releaseSession(connection);
        this.render();
        this.consoleScript.setStatus(
          'Collaboration disconnected. Retry sync to rejoin; local editing still works.'
        );
      });
      listen(connection.transport, 'close', () => {
        if (current()) this.leave();
      });
      listen(this.bridge, 'selectionchange', () => this.renderRoster());
      listen(this.bridge, 'diagnosticschange', () => {
        if (current()) this.render();
      });
      listen(this.bridge, 'statuschange', () => {
        if (!current()) return;
        if (this.bridge.status === 'ready' && this.failureFromBridge)
          this.clearFailure();
        this.render();
      });
      listen(
        this.bridge,
        'error',
        ({error, operation}) =>
          current() && this.reportError(error, operation, true)
      );
      xb.add(this.bridge);
      await xb.initScript(this.bridge);
      if (current()) connection.ready = true;
    } catch (error) {
      if (!current()) return;
      this.releaseSession(connection);
      this.reportError(error, 'connection');
    } finally {
      connection.joining = false;
      if (!current()) {
        // close() before open() settles is a no-op in NetSession.
        // Close the captured session again if it came alive after cancellation.
        if (connection.session?.isOpen) connection.session.close();
        connection.transport?.close();
      } else {
        this.render();
      }
    }
  }

  async reconnect() {
    if (this.disposed || this.room.busy || !this.options.room) return;
    try {
      const source = new URL(this.url);
      source.searchParams.set('transport', this.draft.transport);
      source.searchParams.set('relay', this.draft.relay.trim());
      const displayName = readableName(this.draft.name);
      if (!displayName)
        throw new Error('Enter your display name before connecting.');
      const next = {...this.options, ...connectionOptions(source), displayName};
      this.releaseSession();
      this.clearFailure();
      this.options = next;
      this.roomNotice = '';
      this.draft.name = displayName;
      if (next.transport === 'websocket') this.draft.relay = next.relay;
      this.updateIdentity();
      await this.start();
    } catch (error) {
      this.reportError(error, 'configuration');
    }
  }

  leave() {
    if (this.disposed) return;
    this.releaseSession();
    this.clearFailure();
    this.render();
  }

  clearFailure() {
    if (this.consoleScript.errorMessage === this.failure) {
      this.consoleScript.setError('');
    }
    this.failure = '';
    this.failureOperation = '';
    this.failureFromBridge = false;
    this.invalidConfiguration = false;
  }

  voiceUnavailable() {
    if (!window.isSecureContext)
      return 'Peer voice requires HTTPS or localhost and site microphone permission.';
    if (
      !navigator.mediaDevices?.getUserMedia ||
      typeof RTCPeerConnection === 'undefined'
    ) {
      return 'Peer voice is unavailable in this browser. Use a browser with microphone capture and WebRTC.';
    }
    return '';
  }

  async toggleVoice() {
    const session = this.session;
    if (this.disposed || !session?.isOpen || this.joining) return;
    const request = ++this.voiceRequest;
    this.voiceFailure = '';
    if (this.voicePending) {
      this.voicePending = false;
      session.voice.cancelPendingEnable();
      this.renderVoice();
      return;
    }
    if (session.voice.isEnabled()) {
      session.voice.setMuted(!session.voice.isMuted());
      this.renderVoice();
      return;
    }
    const unavailable = this.voiceUnavailable();
    if (unavailable) {
      this.voiceFailure = unavailable;
      this.renderVoice();
      return;
    }
    this.voicePending = true;
    this.renderVoice();
    try {
      this.resumePlayback();
      await session.voice.enable(session.transport.remotePeerIds);
    } catch (error) {
      if (
        this.session === session &&
        this.voiceRequest === request &&
        !this.disposed
      ) {
        session.voice.cancelPendingEnable();
        this.voiceFailure = `Peer voice: ${error?.message ?? String(error)}`;
      }
    } finally {
      if (
        this.session === session &&
        this.voiceRequest === request &&
        !this.disposed
      ) {
        this.voicePending = false;
        this.renderVoice();
      }
    }
  }

  togglePlayback() {
    if (this.disposed) return;
    this.playbackMuted = !this.playbackMuted;
    this.session?.setPlaybackMuted(this.playbackMuted);
    if (!this.playbackMuted) this.resumePlayback();
    this.render();
  }

  togglePeerPlayback(id) {
    if (!this.session?.isOpen || !this.session.users.has(id)) {
      this.reportError(
        new Error('That participant is no longer connected.'),
        'playback'
      );
      return;
    }
    this.session.setPeerPlaybackMuted(
      id,
      !this.session.isPeerPlaybackMuted(id)
    );
    if (!this.playbackMuted && !this.session.isPeerPlaybackMuted(id))
      this.resumePlayback();
    this.render();
  }

  resumePlayback() {
    const session = this.session;
    if (!session?.isOpen) return;
    const failed = (error) => {
      if (!this.disposed && this.session === session)
        this.reportError(error, 'playback');
    };
    try {
      const resumed = xb.core?.sound?.listener?.context?.resume();
      void resumed?.catch(failed);
    } catch (error) {
      failed(error);
    }
  }

  renderVoice() {
    this.render();
  }

  reportError(error, operation = 'sync', fromBridge = false) {
    if (this.disposed) return;
    this.invalidConfiguration = operation === 'configuration';
    if (this.invalidConfiguration) {
      setProperty(this.dom.collabSettings, 'open', true);
    }
    this.failureOperation = operation;
    this.failureFromBridge = fromBridge;
    this.failure = `Collaboration ${operation}: ${error?.message ?? String(error)}`;
    this.consoleScript.showError(new Error(this.failure));
    this.consoleScript.setStatus(
      'Collaboration needs attention. Check the sync error, then retry.'
    );
    this.render();
  }

  async retry() {
    if (this.disposed || this.joining || this.room.busy || !this.options.room)
      return;
    if (!this.connection && this.invalidConfiguration) {
      await this.reconnect();
      return;
    }
    this.clearFailure();
    this.consoleScript.setStatus(RETRY_MESSAGE);
    if (
      !this.bridge ||
      !this.session?.isOpen ||
      this.bridge.status === 'closed'
    ) {
      this.releaseSession();
      await this.start();
      return;
    }
    try {
      this.bridge.resync();
      this.render();
    } catch (error) {
      this.reportError(error);
    }
  }

  getState() {
    const peerCount = this.session?.users.size ?? 0;
    const roomCode =
      this.options.transport === 'webrtc' &&
      /^[A-Z]{4}$/.test(this.options.room)
        ? this.options.room
        : null;
    const joined = this.isCurrentRoom(
      normalizeRoomCode(this.joinCode),
      this.draft.name
    );
    const draftDirty =
      this.draft.name !== this.options.displayName ||
      this.draft.transport !== this.options.transport ||
      (this.draft.transport === 'websocket' &&
        this.draft.relay !== this.options.relay);
    const status = this.disposed
      ? 'closed'
      : this.failure
        ? 'error'
        : this.joining
          ? 'syncing'
          : (this.bridge?.status ?? 'closed');
    const pending = this.bridge?.pendingCount ?? 0;
    const statusText =
      status === 'error'
        ? this.failure || 'Sync failed. Check the error above and retry.'
        : !this.disposed && this.joining
          ? `Joining ${TRANSPORTS[this.options.transport].label}…`
          : this.session?.isOpen && !peerCount
            ? `Waiting for peers${pending ? ` · ${pending} pending` : ''} · ${TRANSPORTS[this.options.transport].label}`
            : status === 'ready'
              ? peerCount
                ? `Connected · ${peerCount} peer${peerCount === 1 ? '' : 's'} · ${TRANSPORTS[this.options.transport].label}`
                : `Waiting for peers · ${TRANSPORTS[this.options.transport].label}`
              : status === 'syncing'
                ? `Syncing${pending ? ` · ${pending} pending` : ''}…`
                : this.options.room
                  ? 'Disconnected · your local scene is still available'
                  : 'Start a new room or join a code. Your scene is local until you join.';
    const enabled = this.session?.voice.isEnabled() ?? false;
    const transmitting = enabled && !this.session.voice.isMuted();
    const unavailable = this.voiceUnavailable();
    const participants = [];
    if (this.session && this.connection.ready && !this.disposed) {
      const names = new Map(
        this.room.layout.objects.map((object) => [object.id, object.name])
      );
      const add = (id, name, selectedId, local, micOn) =>
        participants.push({
          id,
          name: readableName(name) || 'Maker',
          local,
          micOn,
          color: this.bridge.getPeerColor(id),
          selection: selectedId
            ? `Selected: ${names.get(selectedId) ?? selectedId}`
            : 'Nothing selected',
          mutedForMe: local ? false : this.session.isPeerPlaybackMuted(id),
        });
      add(
        this.session.localPeerId,
        this.options.displayName,
        this.room.selectedId,
        true,
        transmitting
      );
      for (const user of this.session.users.values()) {
        add(
          user.peerId,
          user.displayName,
          this.bridge.remoteSelections.get(user.peerId),
          false,
          user.avatar?.voiceActive === true
        );
      }
    }
    return {
      applied: {
        room: this.options.room,
        roomId: this.options.roomId,
        transport: this.options.transport,
        relay: this.options.relay,
        name: this.options.displayName,
      },
      draft: {...this.draft},
      rooms: {
        code: roomCode,
        input: this.joinCode,
        notice:
          this.roomNotice ||
          (!roomCode && this.options.room
            ? 'Use Open peer link for this connection. Start or Join switches to a WebRTC code room; either view can join.'
            : ''),
        mode: this.options.virtual ? 'Virtual world' : 'Physical room',
        startDisabled: this.disposed || this.room.busy || this.joining,
        joinLabel: joined
          ? 'Joined'
          : roomCode &&
              normalizeRoomCode(this.joinCode) === roomCode &&
              this.session?.isOpen
            ? 'Rejoin'
            : 'Join',
        joinDisabled:
          this.disposed ||
          this.room.busy ||
          this.joining ||
          joined ||
          !normalizeRoomCode(this.joinCode),
        copyDisabled: this.disposed || !this.session?.isOpen || !roomCode,
      },
      draftDirty,
      draftStatus: draftDirty
        ? 'Changes are not applied yet.'
        : 'Settings match the current connection.',
      transportLabel: TRANSPORTS[this.options.transport].label,
      transportHelp: TRANSPORTS[this.draft.transport].help,
      status,
      statusText,
      error: this.failure,
      pending,
      joining: this.joining,
      connected: !!this.session?.isOpen && !!this.connection?.ready,
      roomBusy: this.room.busy,
      peerCount,
      peerHint: peerCount
        ? 'Peer links are open. Diagnostics shows whether scene import or clock sync is still pending.'
        : 'No other peers connected. Check the code and transport on both devices. Physical and virtual views share the same room.',
      diagnostics: this.diagnosticsView(),
      controls: {
        resetDisabled:
          this.disposed ||
          (!draftDirty && this.failureOperation !== 'configuration'),
        settingsDisabled: this.disposed,
        retryDisabled:
          this.disposed ||
          !this.options.room ||
          this.joining ||
          this.room.busy ||
          this.bridge?.status === 'syncing',
        connectDisabled: this.disposed || this.room.busy || !this.options.room,
        disconnectDisabled: this.disposed || !this.connection,
      },
      microphone: {
        enabled,
        transmitting,
        pending: this.voicePending,
        disabled:
          this.disposed ||
          !this.session?.isOpen ||
          this.joining ||
          (!!unavailable && !enabled && !this.voicePending),
        label: transmitting
          ? 'Mute my mic'
          : this.voicePending
            ? 'Cancel mic request'
            : 'Unmute my mic',
        statusText:
          this.voiceFailure ||
          (transmitting
            ? 'My microphone on · live audio goes to peers, not Gemini.'
            : enabled
              ? 'My microphone muted · incoming audio stays connected. Disconnect to release capture.'
              : this.voicePending
                ? 'Waiting for microphone permission. Cancel or disconnect to discard a late request.'
                : unavailable ||
                  'My microphone off. Unmute is opt-in; listening controls never request capture.'),
        error: this.voiceFailure,
      },
      listening: {muted: this.playbackMuted, disabled: this.disposed},
      participants,
      shareUrl:
        !this.options.room || (this.invalidConfiguration && !this.connection)
          ? null
          : collaborationPeerUrl(this.url, this.options),
    };
  }

  render() {
    const state = this.getState();
    this.diagnosticLog.capture({
      mode: state.rooms.mode,
      roomId: state.applied.roomId,
      transport: state.applied.transport,
      session: this.sessionNumber,
      localPeerId: this.session?.localPeerId ?? '',
      peers: this.session?.users.keys() ?? [],
      channelPeers: this.connection?.transport?.remotePeerIds ?? [],
      transportOpen: this.connection?.transport?.isOpen === true,
      status: state.status,
      pending: state.pending,
      roomStatus: this.room.status,
      authoring: this.consoleScript.running === true,
      configuring: this.consoleScript.connecting === true,
      transcription: this.consoleScript.voice.state,
      visible: !document.hidden,
      inXR: xb.core.renderer.xr.isPresenting === true,
      secureContext: window.isSecureContext === true,
      objects: this.room.layout.objects,
      selectedId: this.room.selectedId,
      bridge: this.bridge?.diagnostics,
      clock: this.bridge?.motionClockState,
      microphone: {
        enabled: state.microphone.enabled,
        muted: !state.microphone.transmitting,
      },
      playbackMuted: this.playbackMuted,
      errorOperation:
        this.failureOperation || (this.voiceFailure ? 'voice' : ''),
    });
    state.diagnostics = this.diagnosticsView();
    if (
      state.status === 'ready' &&
      this.consoleScript.statusMessage === RETRY_MESSAGE
    ) {
      this.consoleScript.setStatus(
        state.peerCount
          ? 'Collaboration connected. Continue editing the shared scene.'
          : 'Room opened, but no peers are connected. Check the code and transport on both devices; either view can join.'
      );
    }
    const key = JSON.stringify(state);
    if (key === this.lastStateKey) return;
    this.lastStateKey = key;
    this.renderDOM(state);
    for (const subscriber of this.subscribers) subscriber(state);
    const busy = this.busy;
    if (busy !== this.lastBusy) {
      this.lastBusy = busy;
      this.consoleScript.refresh();
    }
  }

  renderRoster() {
    this.render();
  }

  renderDOM(state) {
    const dom = this.dom;
    const roomActions = [
      dom.collabStartRoom,
      dom.collabJoinRoom,
      dom.collabJoinCode,
    ];
    const active = document.activeElement;
    if (active === dom.collabRetry && state.controls.retryDisabled)
      this.retryHadFocus = true;
    if (state.joining && roomActions.includes(active))
      this.roomActionHadFocus = true;
    if (state.connected && !this.hasConnected) {
      this.hasConnected = true;
      const focusedAction = roomActions.includes(active);
      if (!dom.collabRooms.contains(active) || focusedAction) {
        if (
          focusedAction ||
          (active === document.body && this.roomActionHadFocus)
        )
          dom.collabRoomsSummary.focus();
        setProperty(dom.collabRooms, 'open', false);
      }
      this.roomActionHadFocus = false;
    }
    setProperty(
      dom.collabRoomsSummary,
      'textContent',
      state.applied.room ? 'Room options' : 'Start or join a room'
    );
    setProperty(dom.collabActions, 'hidden', !state.applied.room);
    setProperty(dom.collabLobbyName, 'value', state.draft.name);
    setProperty(
      dom.collabLobbyName,
      'disabled',
      state.controls.settingsDisabled
    );
    setProperty(dom.collabStatus.dataset, 'state', state.status);
    setProperty(dom.collabStatus, 'textContent', state.statusText);
    setProperty(
      dom.collabDiagnosticsSummary,
      'textContent',
      state.diagnostics.summary
    );
    setProperty(
      dom.collabDiagnosticsHistory,
      'textContent',
      state.diagnostics.recent
    );
    setProperty(
      dom.collabDiagnosticsNotice,
      'textContent',
      state.diagnostics.notice
    );
    setProperty(
      dom.collabDiagnosticsCopy,
      'disabled',
      state.diagnostics.disabled || state.diagnostics.copying
    );
    setProperty(
      dom.collabDiagnosticsCopy,
      'textContent',
      state.diagnostics.copying ? 'Copying...' : 'Copy diagnostics'
    );
    setProperty(
      dom.collabDiagnosticsDownload,
      'disabled',
      state.diagnostics.disabled
    );
    setProperty(
      dom.collabDiagnosticsRefresh,
      'disabled',
      state.diagnostics.disabled
    );
    setProperty(
      dom.collabRoomCode,
      'textContent',
      state.rooms.code
        ? `Room code: ${state.rooms.code}`
        : state.applied.room
          ? `Named room: ${state.applied.room}`
          : 'No room joined'
    );
    setProperty(
      dom.collabRoomNotice,
      'textContent',
      state.rooms.notice ||
        (state.connected && !state.peerCount
          ? state.peerHint
          : 'One code works in either view. Codes are meeting identifiers, not passwords.')
    );
    setProperty(dom.collabJoinCode, 'value', state.rooms.input);
    setProperty(dom.collabJoinCode, 'disabled', state.rooms.startDisabled);
    setProperty(dom.collabStartRoom, 'disabled', state.rooms.startDisabled);
    setProperty(dom.collabJoinRoom, 'disabled', state.rooms.joinDisabled);
    setProperty(dom.collabJoinRoom, 'textContent', state.rooms.joinLabel);
    setProperty(dom.collabCopyCode, 'disabled', state.rooms.copyDisabled);
    setProperty(
      dom.collabIdentity,
      'textContent',
      `${state.applied.name} · ${state.rooms.mode} view`
    );
    setProperty(dom.collabTransport, 'value', state.draft.transport);
    setProperty(
      dom.collabTransport,
      'disabled',
      state.controls.settingsDisabled
    );
    setProperty(dom.collabName, 'value', state.draft.name);
    setProperty(dom.collabName, 'disabled', state.controls.settingsDisabled);
    setProperty(dom.collabRelay, 'value', state.draft.relay);
    setProperty(dom.collabDraftIndicator, 'hidden', !state.draftDirty);
    setProperty(dom.collabDraftStatus, 'textContent', state.draftStatus);
    setProperty(dom.collabReset, 'disabled', state.controls.resetDisabled);
    setProperty(
      dom.collabRelayField,
      'hidden',
      state.draft.transport !== 'websocket'
    );
    setProperty(
      dom.collabRelay,
      'required',
      state.draft.transport === 'websocket'
    );
    setProperty(
      dom.collabRelay,
      'disabled',
      state.controls.settingsDisabled || state.draft.transport !== 'websocket'
    );
    setProperty(dom.collabTransportHelp, 'textContent', state.transportHelp);
    setProperty(dom.collabRetry, 'disabled', state.controls.retryDisabled);
    if (this.retryHadFocus && !state.controls.retryDisabled) {
      this.retryHadFocus = false;
      if (
        document.activeElement === document.body &&
        !this.consoleScript.keyboardCard?.visible &&
        !dom.collabRetry.closest('[hidden], .rc-collapsed, .rc-hidden')
      )
        dom.collabRetry.focus();
    }
    setProperty(dom.collabConnect, 'disabled', state.controls.connectDisabled);
    setProperty(dom.collabLeave, 'disabled', state.controls.disconnectDisabled);
    if (state.shareUrl) {
      setAttribute(dom.collabLink, 'href', state.shareUrl);
      if (dom.collabLink.hasAttribute('aria-disabled'))
        dom.collabLink.removeAttribute('aria-disabled');
    } else {
      if (dom.collabLink.hasAttribute('href'))
        dom.collabLink.removeAttribute('href');
      setAttribute(dom.collabLink, 'aria-disabled', true);
    }
    setProperty(dom.collabVoice, 'textContent', state.microphone.label);
    setProperty(dom.collabVoice, 'disabled', state.microphone.disabled);
    setAttribute(
      dom.collabVoice,
      'aria-pressed',
      state.microphone.transmitting
    );
    setProperty(
      dom.collabVoiceStatus,
      'textContent',
      state.microphone.statusText
    );
    setProperty(
      dom.collabVoiceStatus.dataset,
      'state',
      state.microphone.error
        ? 'error'
        : state.microphone.transmitting
          ? 'on'
          : 'off'
    );
    setProperty(
      dom.collabPlayback,
      'textContent',
      state.listening.muted ? 'Unmute everyone for me' : 'Mute everyone for me'
    );
    setProperty(dom.collabPlayback, 'disabled', state.listening.disabled);
    setAttribute(dom.collabPlayback, 'aria-pressed', state.listening.muted);
    setProperty(
      dom.collabPlaybackStatus,
      'textContent',
      state.listening.muted
        ? 'All incoming peer audio is muted for me. Individual choices are retained.'
        : 'Incoming peer audio is on, except people individually muted for me.'
    );
    const list = this.dom.collabPeers;
    const ids = new Set(state.participants.map((peer) => peer.id));
    for (const [id, row] of this.rows) {
      if (ids.has(id)) continue;
      row.cleanup();
      row.root.remove();
      this.rows.delete(id);
    }
    state.participants.forEach((peer, index) => {
      let row = this.rows.get(peer.id);
      if (!row) {
        const root = document.createElement('li');
        root.className = 'rc-peer';
        root.dataset.peerId = peer.id;
        const name = document.createElement('span');
        name.className = 'rc-peer-name';
        const selection = document.createElement('span');
        selection.className = 'rc-peer-selection';
        const mic = document.createElement('span');
        mic.className = 'rc-peer-voice';
        const mute = document.createElement('button');
        mute.type = 'button';
        mute.className = 'rc-button rc-peer-mute';
        const click = () => this.togglePeerPlayback(peer.id);
        mute.addEventListener('click', click);
        root.append(name, selection, mic, mute);
        row = {
          root,
          name,
          selection,
          mic,
          mute,
          cleanup: () => mute.removeEventListener('click', click),
        };
        this.rows.set(peer.id, row);
      }
      const color = `#${peer.color.toString(16).padStart(6, '0')}`;
      if (row.root.style.getPropertyValue('--rc-peer-color') !== color)
        row.root.style.setProperty('--rc-peer-color', color);
      setProperty(
        row.name,
        'textContent',
        `${peer.name}${peer.local ? ' (you)' : ''}`
      );
      setProperty(row.selection, 'textContent', peer.selection);
      setProperty(
        row.mic,
        'textContent',
        peer.micOn ? 'Mic on' : 'Mic muted/off'
      );
      setProperty(row.mute, 'hidden', peer.local);
      setProperty(row.mute, 'disabled', !state.connected);
      setProperty(
        row.mute,
        'textContent',
        peer.mutedForMe ? 'Unmute for me' : 'Mute for me'
      );
      setAttribute(row.mute, 'aria-pressed', peer.mutedForMe);
      setAttribute(
        row.mute,
        'aria-label',
        `${peer.mutedForMe ? 'Unmute' : 'Mute'} ${peer.name} for me`
      );
      if (list.children[index] !== row.root)
        list.insertBefore(row.root, list.children[index] ?? null);
    });
  }

  releaseSession(connection = this.connection) {
    if (!connection) return;
    if (this.connection === connection) {
      this.connection = null;
      this.voiceRequest++;
      this.voicePending = false;
      this.voiceFailure = '';
    }
    connection.cleanups.splice(0).forEach((cleanup) => cleanup());
    connection.bridge?.dispose();
    connection.bridge?.removeFromParent();
    // disable() also invalidates an outstanding getUserMedia request.
    connection.session?.voice.disable();
    if (connection.session && connection.net?.session === connection.session) {
      connection.net.leaveRoom();
    } else {
      connection.session?.close();
    }
    connection.transport?.close();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.cleanups.splice(0).forEach((cleanup) => cleanup());
    this.releaseSession();
    this.render();
    this.spatial?.dispose();
    this.subscribers.clear();
  }
}

export async function startCollaboration(
  room,
  consoleScript,
  {virtual = false, url = window.location.href} = {}
) {
  let options;
  let configurationError;
  try {
    options = collaborationOptions(url, virtual);
  } catch (error) {
    const fallback = new URL(url);
    fallback.searchParams.delete('transport');
    fallback.searchParams.delete('relay');
    options = collaborationOptions(fallback, virtual);
    configurationError = error;
  }
  if (!options || consoleScript.disposed || consoleScript.pageLeft) return null;
  const collaboration = new Collaboration(room, consoleScript, options, url);
  consoleScript.collaboration = collaboration;
  collaboration.mountSpatial();
  if (configurationError) {
    const source = new URL(url);
    const transport = source.searchParams.get('transport');
    if (Object.hasOwn(TRANSPORTS, transport)) {
      collaboration.setDraft('transport', transport);
    }
    collaboration.setDraft('relay', source.searchParams.get('relay') ?? '');
    collaboration.reportError(configurationError, 'configuration');
    return collaboration;
  }
  await collaboration.start();
  return collaboration;
}
