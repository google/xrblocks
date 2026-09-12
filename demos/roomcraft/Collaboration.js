import * as xb from 'xrblocks';
import {
  BroadcastChannelTransport,
  WebRTCTransport,
  WebSocketTransport,
  enableNet,
} from 'xrblocks/addons/netblocks/src/index.js';
import {RoomcraftNet} from 'xrblocks/addons/roomcraft/index.js';

const DEFAULT_ROOM = 'roomcraft-demo';
const RETRY_MESSAGE = 'Retrying collaboration sync.';
const TRANSPORTS = {
  broadcast: {
    label: 'same-browser collaboration',
    help: 'BroadcastChannel needs the same browser profile and exact origin (scheme, host and port). It cannot connect another device.',
  },
  webrtc: {
    label: 'WebRTC collaboration',
    help: 'Cross-device / off-LAN via the existing public PeerJS broker and STUN. Best-effort, rate-limited, up to 12 peers. NAT/firewalls can block connections; no TURN is configured. Use the same room, mode and transport.',
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
  const transport = source.searchParams.get('transport') || 'broadcast';
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
  const room = requestedRoom || DEFAULT_ROOM;
  const displayName =
    readableName(source.searchParams.get('name')) ||
    `Maker ${crypto.getRandomValues(new Uint16Array(1))[0].toString(16).padStart(4, '0')}`;
  return {
    room,
    roomId: `roomcraft:${virtual ? 'virtual' : 'room'}:${room}`,
    displayName,
    virtual,
    ...connectionOptions(source),
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

/** Optional DOM presentation only; RoomcraftNet owns all scene replication. */
class Collaboration {
  constructor(room, consoleScript, options, url) {
    this.room = room;
    this.consoleScript = consoleScript;
    this.options = options;
    this.url = url;
    this.cleanups = [];
    this.disposed = false;
    this.failure = '';
    this.voiceFailure = '';
    this.voiceRequest = 0;
    this.voicePending = false;
    this.dom = Object.fromEntries(
      [
        'collaboration',
        'collabStatus',
        'collabIdentity',
        'collabPeers',
        'collabRetry',
        'collabLink',
        'collabConnection',
        'collabTransport',
        'collabTransportHelp',
        'collabRelayField',
        'collabRelay',
        'collabName',
        'collabConnect',
        'collabLeave',
        'collabVoice',
        'collabVoiceStatus',
      ].map((id) => [id, document.getElementById(id)])
    );
    this.dom.collaboration.hidden = false;
    this.dom.collabTransport.value = options.transport;
    this.dom.collabRelay.value = options.relay;
    this.dom.collabName.value = options.displayName;
    this.updateConnectionFields();
    this.updateIdentity();
    this.listen(this.dom.collabRetry, 'click', () => void this.retry());
    this.listen(this.dom.collabTransport, 'change', () =>
      this.updateConnectionFields()
    );
    this.listen(this.dom.collabConnection, 'submit', (event) => {
      event.preventDefault();
      void this.reconnect();
    });
    this.listen(this.dom.collabLeave, 'click', () => this.leave());
    this.listen(this.dom.collabVoice, 'click', () => void this.toggleVoice());
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

  updateConnectionFields() {
    const transport = this.dom.collabTransport.value;
    this.dom.collabRelayField.hidden = transport !== 'websocket';
    this.dom.collabRelay.required = transport === 'websocket';
    this.dom.collabRelay.disabled = transport !== 'websocket';
    this.dom.collabTransportHelp.textContent = TRANSPORTS[transport].help;
  }

  updateIdentity() {
    this.dom.collabIdentity.textContent = `${this.options.displayName} · ${this.options.roomId}`;
    this.dom.collabLink.href = collaborationPeerUrl(this.url, this.options);
    this.dom.collabLink.removeAttribute('aria-disabled');
  }

  get busy() {
    return (
      !this.disposed &&
      (this.joining ||
        this.bridge?.status === 'syncing' ||
        (this.bridge?.pendingCount ?? 0) > 0)
    );
  }

  listen(target, type, listener, cleanups = this.cleanups) {
    target.addEventListener(type, listener);
    cleanups.push(() => target.removeEventListener(type, listener));
  }

  async start() {
    if (this.disposed || this.joining) return;
    const connection = {joining: true, cleanups: [], ready: false};
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
      await joined;
      if (!current()) return;
      const session = connection.session;
      connection.bridge = new RoomcraftNet(this.room, session);
      listen(session, 'user-join', () => this.renderRoster());
      listen(session, 'user-update', () => this.renderRoster());
      listen(session, 'user-leave', () => this.renderRoster());
      listen(session, 'local-voice-state', () => {
        this.renderVoice();
        this.renderRoster();
      });
      listen(session, 'peer-voice-state', () => this.renderRoster());
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
      listen(this.bridge, 'statuschange', () => this.render());
      listen(this.bridge, 'error', ({error, operation}) =>
        this.reportError(error, operation)
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
    if (this.disposed || this.room.busy) return;
    try {
      const source = new URL(this.url);
      source.searchParams.set('transport', this.dom.collabTransport.value);
      source.searchParams.set('relay', this.dom.collabRelay.value.trim());
      const displayName = readableName(this.dom.collabName.value);
      if (!displayName)
        throw new Error('Enter your display name before connecting.');
      const next = {...this.options, ...connectionOptions(source), displayName};
      this.releaseSession();
      this.clearFailure();
      this.options = next;
      this.dom.collabName.value = displayName;
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
      session.voice.disable();
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
      const resumed = xb.core?.sound?.listener?.context?.resume();
      await Promise.all([
        session.voice.enable(session.transport.remotePeerIds),
        resumed,
      ]);
    } catch (error) {
      if (
        this.session === session &&
        this.voiceRequest === request &&
        !this.disposed
      ) {
        session.voice.disable();
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

  renderVoice() {
    const enabled = this.session?.voice.isEnabled() ?? false;
    const transmitting = enabled && !this.session.voice.isMuted();
    const unavailable = this.voiceUnavailable();
    this.dom.collabVoice.textContent = transmitting
      ? 'Mute peer mic'
      : this.voicePending
        ? 'Cancel mic request'
        : 'Unmute peer mic';
    this.dom.collabVoice.setAttribute('aria-pressed', String(transmitting));
    this.dom.collabVoice.disabled =
      this.disposed ||
      !this.session?.isOpen ||
      this.joining ||
      (!!unavailable && !enabled && !this.voicePending);
    this.dom.collabVoiceStatus.textContent =
      this.voiceFailure ||
      (transmitting
        ? 'Peer microphone on · audio goes to connected peers, not Gemini.'
        : enabled
          ? 'Peer microphone muted · incoming audio stays connected. Disconnect to release the microphone and close peer audio.'
          : this.voicePending
            ? 'Waiting for microphone permission. Cancel or leave to discard a late request.'
            : unavailable ||
              'Peer microphone off. Unmute is opt-in; receiving peer audio does not enable your mic.');
    this.dom.collabVoiceStatus.dataset.state = this.voiceFailure
      ? 'error'
      : transmitting
        ? 'on'
        : 'off';
  }

  reportError(error, operation = 'sync') {
    if (this.disposed) return;
    if (operation === 'configuration') this.invalidConfiguration = true;
    this.failure = `Collaboration ${operation}: ${error?.message ?? String(error)}`;
    this.consoleScript.showError(new Error(this.failure));
    this.consoleScript.setStatus(
      'Collaboration needs attention. Check the sync error, then retry.'
    );
    this.render();
  }

  async retry() {
    if (this.disposed || this.joining || this.room.busy) return;
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

  render() {
    const status = this.disposed
      ? 'closed'
      : this.failure
        ? 'error'
        : this.joining
          ? 'syncing'
          : (this.bridge?.status ?? 'closed');
    const pending = this.bridge?.pendingCount ?? 0;
    this.dom.collabStatus.dataset.state = status;
    this.dom.collabStatus.textContent =
      status === 'error'
        ? this.failure || 'Sync failed. Check the error above and retry.'
        : !this.disposed && this.joining
          ? `Joining ${TRANSPORTS[this.options.transport].label}…`
          : status === 'ready'
            ? `Connected · ${TRANSPORTS[this.options.transport].label}`
            : status === 'syncing'
              ? `Syncing${pending ? ` · ${pending} pending` : ''}…`
              : 'Disconnected · your local scene is still available';
    this.dom.collabRetry.disabled =
      this.disposed ||
      this.joining ||
      this.room.busy ||
      this.bridge?.status === 'syncing';
    this.dom.collabConnect.disabled = this.disposed || this.room.busy;
    this.dom.collabLeave.disabled = this.disposed || !this.connection;
    if (
      status === 'ready' &&
      this.consoleScript.statusMessage === RETRY_MESSAGE
    ) {
      this.consoleScript.setStatus(
        'Collaboration connected. Continue editing the shared scene.'
      );
    }
    this.renderRoster();
    this.renderVoice();
    this.consoleScript.refresh();
  }

  renderRoster() {
    const list = this.dom.collabPeers;
    list.replaceChildren();
    if (!this.session || !this.connection.ready || this.disposed) return;
    const names = new Map(
      this.room.layout.objects.map((object) => [object.id, object.name])
    );
    const addPeer = (peerId, name, selectedId, local = false) => {
      const row = document.createElement('li');
      row.className = 'rc-peer';
      row.style.setProperty(
        '--rc-peer-color',
        `#${this.bridge.getPeerColor(peerId).toString(16).padStart(6, '0')}`
      );
      const identity = document.createElement('span');
      identity.className = 'rc-peer-name';
      identity.textContent = `${readableName(name) || 'Maker'}${local ? ' (you)' : ''}`;
      const selection = document.createElement('span');
      selection.className = 'rc-peer-selection';
      selection.textContent = selectedId
        ? `Selected: ${names.get(selectedId) ?? selectedId}`
        : 'Nothing selected';
      const mic = document.createElement('span');
      mic.className = 'rc-peer-voice';
      const transmitting = local
        ? this.session.voice.isEnabled() && !this.session.voice.isMuted()
        : this.session.users.get(peerId)?.avatar?.voiceActive === true;
      mic.textContent = transmitting ? 'Mic on' : 'Mic muted/off';
      row.append(identity, selection, mic);
      list.append(row);
    };
    addPeer(
      this.session.localPeerId,
      this.options.displayName,
      this.room.selectedId,
      true
    );
    for (const user of this.session.users.values()) {
      addPeer(
        user.peerId,
        user.displayName,
        this.bridge.remoteSelections.get(user.peerId)
      );
    }
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
  if (configurationError) {
    const source = new URL(url);
    const transport = source.searchParams.get('transport');
    if (Object.hasOwn(TRANSPORTS, transport)) {
      collaboration.dom.collabTransport.value = transport;
      collaboration.updateConnectionFields();
    }
    collaboration.reportError(configurationError, 'configuration');
    collaboration.dom.collabLink.removeAttribute('href');
    collaboration.dom.collabLink.setAttribute('aria-disabled', 'true');
    return collaboration;
  }
  await collaboration.start();
  return collaboration;
}
