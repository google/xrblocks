import * as xb from 'xrblocks';
import {
  BroadcastChannelTransport,
  enableNet,
} from 'xrblocks/addons/netblocks/src/index.js';
import {RoomcraftNet} from 'xrblocks/addons/roomcraft/index.js';

const DEFAULT_ROOM = 'roomcraft-demo';
const RETRY_MESSAGE = 'Retrying collaboration sync.';

function readableName(value) {
  return (value ?? '')
    .replace(/[\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 40);
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
  };
}

/** Build from an allowlist, not a copied query: even nested key URLs stay out. */
export function collaborationPeerUrl(url, options) {
  const source = new URL(url);
  const peer = new URL(source.pathname, source.origin);
  peer.searchParams.set('collab', '1');
  peer.searchParams.set('room', options.room);
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
    this.cleanups = [];
    this.sessionCleanups = [];
    this.disposed = false;
    this.joining = false;
    this.failure = '';
    this.dom = Object.fromEntries(
      [
        'collaboration',
        'collabStatus',
        'collabIdentity',
        'collabPeers',
        'collabRetry',
        'collabLink',
      ].map((id) => [id, document.getElementById(id)])
    );
    this.dom.collaboration.hidden = false;
    this.dom.collabIdentity.textContent = `${options.displayName} · ${options.roomId}`;
    this.dom.collabLink.href = collaborationPeerUrl(url, options);
    this.listen(this.dom.collabRetry, 'click', () => void this.retry());
    this.listen(window, 'pagehide', () => this.dispose());
    this.listen(room, 'change', () => this.renderRoster());
    this.listen(room, 'selectionchange', () => this.renderRoster());
    this.listen(room, 'statuschange', () => this.render());
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
    this.joining = true;
    this.render();
    try {
      this.net = enableNet();
      this.transport = new BroadcastChannelTransport();
      const joined = this.net.joinRoom(this.options.roomId, {
        transport: this.transport,
        displayName: this.options.displayName,
        role: 'user',
      });
      // Retain ownership even if joining fails or the page leaves mid-await.
      this.session = this.net.session;
      const session = await joined;
      if (this.disposed) {
        session.close();
        return;
      }
      this.session = session;
      this.bridge = new RoomcraftNet(this.room, session);
      const listen = (target, type, listener) =>
        this.listen(target, type, listener, this.sessionCleanups);
      listen(session, 'user-join', () => this.renderRoster());
      listen(session, 'user-leave', () => this.renderRoster());
      listen(session, 'close', () => {
        this.releaseSession();
        this.render();
        this.consoleScript.setStatus(
          'Collaboration disconnected. Retry sync to rejoin; local editing still works.'
        );
      });
      listen(this.transport, 'error', (event) =>
        this.reportError(event.detail.error, 'transport')
      );
      listen(this.bridge, 'selectionchange', () => this.renderRoster());
      listen(this.bridge, 'statuschange', () => this.render());
      listen(this.bridge, 'error', ({error, operation}) =>
        this.reportError(error, operation)
      );
      xb.add(this.bridge);
      await xb.initScript(this.bridge);
      if (!this.disposed && this.bridge) this.bridgeReady = true;
    } catch (error) {
      if (this.disposed) return;
      this.releaseSession();
      this.reportError(error, 'connection');
    } finally {
      this.joining = false;
      this.render();
    }
  }

  reportError(error, operation = 'sync') {
    if (this.disposed) return;
    this.failure = `Collaboration ${operation}: ${error?.message ?? String(error)}`;
    this.consoleScript.showError(new Error(this.failure));
    this.consoleScript.setStatus(
      'Collaboration needs attention. Check the sync error, then retry.'
    );
    this.render();
  }

  async retry() {
    if (this.disposed || this.joining || this.room.busy) return;
    if (this.consoleScript.errorMessage === this.failure) {
      this.consoleScript.setError('');
    }
    this.failure = '';
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
      : this.joining
        ? 'syncing'
        : this.failure
          ? 'error'
          : (this.bridge?.status ?? 'closed');
    const pending = this.bridge?.pendingCount ?? 0;
    this.dom.collabStatus.dataset.state = status;
    this.dom.collabStatus.textContent =
      !this.disposed && this.joining
        ? 'Joining the local room…'
        : status === 'ready'
          ? 'Connected · same-browser collaboration'
          : status === 'syncing'
            ? `Syncing${pending ? ` · ${pending} pending` : ''}…`
            : status === 'error'
              ? this.failure || 'Sync failed. Check the error above and retry.'
              : 'Disconnected · your local scene is still available';
    this.dom.collabRetry.disabled =
      this.disposed ||
      this.joining ||
      this.room.busy ||
      this.bridge?.status === 'syncing';
    if (
      status === 'ready' &&
      this.consoleScript.statusMessage === RETRY_MESSAGE
    ) {
      this.consoleScript.setStatus(
        'Collaboration connected. Continue editing the shared scene.'
      );
    }
    this.renderRoster();
    this.consoleScript.refresh();
  }

  renderRoster() {
    const list = this.dom.collabPeers;
    list.replaceChildren();
    if (!this.session || !this.bridgeReady || this.disposed) return;
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
      row.append(identity, selection);
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

  releaseSession() {
    this.sessionCleanups.splice(0).forEach((cleanup) => cleanup());
    this.bridge?.dispose();
    this.bridge?.removeFromParent();
    this.bridge = null;
    this.bridgeReady = false;
    if (this.session && this.net?.session === this.session) {
      this.net.leaveRoom();
    } else {
      this.session?.close();
    }
    this.transport?.close();
    this.session = null;
    this.transport = null;
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
  const options = collaborationOptions(url, virtual);
  if (!options || consoleScript.disposed || consoleScript.pageLeft) return null;
  const collaboration = new Collaboration(room, consoleScript, options, url);
  consoleScript.collaboration = collaboration;
  await collaboration.start();
  return collaboration;
}
