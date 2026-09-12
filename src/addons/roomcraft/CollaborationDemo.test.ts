import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

// @ts-expect-error The executable browser demo is a JavaScript consumer.
import {
  RoomcraftConsole,
  startRoomcraftDemo,
} from '../../../demos/roomcraft/main.js';

const mocks = vi.hoisted(() => ({
  add: vi.fn(),
  init: vi.fn(async () => {}),
  initScript: vi.fn(async (script: {init: () => Promise<void>}) =>
    script.init()
  ),
  enableNet: vi.fn(),
  netModuleLoaded: vi.fn(),
  bridgeInit: vi.fn(async () => {}),
}));

vi.mock('xrblocks', async () => {
  const {Object3D} = await import('three');
  return {
    Script: Object3D,
    Options: class {
      ai = {gemini: {enabled: true}};
      reticles = {enabled: false};
      sound = {speechRecognizer: {enabled: true}};
      xrButton = {showEnterSimulatorButton: false};
      webxrOptionalFeatures = ['unbounded'];
      simulator = {};
      enableAI() {}
      enablePlaneDetection() {}
      enableHands() {}
      enableVR() {}
      setAppTitle() {}
      setAppDescription() {}
    },
    add: mocks.add,
    init: mocks.init,
    initScript: mocks.initScript,
    core: {renderer: {shadowMap: {}}},
    getUrlParameter: (name: string) =>
      new URL(window.location.href).searchParams.get(name),
  };
});

vi.mock('xrblocks/addons/roomcraft/index.js', async () => {
  const {Object3D} = await import('three');
  return {
    createDefaultCatalog: () => [],
    createModelAsset: (asset: object) => asset,
    SCENE_PLAN_SCHEMA: {},
    MAX_SCENE_REQUEST_CHARACTERS: 4000,
    Roomcraft: class extends Object3D {
      busy = false;
      selectedId: string | null = null;
      layout = {objects: [{id: 'chair', name: 'Reading chair'}]};
    },
    RoomcraftNet: class extends Object3D {
      status = 'ready';
      pendingCount = 0;
      remoteSelections = new Map<string, string | null>();
      resync = vi.fn();
      dispose = vi.fn();
      init = mocks.bridgeInit;
      getPeerColor = () => 0xe8714a;
    },
  };
});

vi.mock('xrblocks/addons/netblocks/src/index.js', () => {
  mocks.netModuleLoaded();
  return {
    enableNet: mocks.enableNet,
    BroadcastChannelTransport: class extends EventTarget {
      close = vi.fn();
    },
  };
});

vi.mock('xrblocks/addons/virtualkeyboard/index.js', () => ({
  Keyboard: class {},
}));
vi.mock('../../../demos/roomcraft/GeminiVoice.js', () => ({
  GeminiVoiceInput: class {
    state = 'idle';
    dispose = vi.fn();
  },
  VOICE_MAX_DURATION_MS: 30000,
  getVoiceFormat: vi.fn(),
}));

interface Bridge extends THREE.Object3D {
  status: string;
  pendingCount: number;
  remoteSelections: Map<string, string | null>;
  resync: ReturnType<typeof vi.fn>;
  dispose: ReturnType<typeof vi.fn>;
  getPeerColor: (peerId: string) => number;
}

class Session extends EventTarget {
  isOpen = true;
  localPeerId = 'local-maker';
  users = new Map<string, {peerId: string; displayName: string}>();
  close = vi.fn(() => {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.dispatchEvent(new Event('close'));
  });
}

const html = readFileSync('demos/roomcraft/index.html', 'utf8');
let session: Session;
let net: {
  session?: Session;
  joinRoom: ReturnType<typeof vi.fn>;
  leaveRoom: ReturnType<typeof vi.fn>;
};
let consoleScript: InstanceType<typeof RoomcraftConsole> | undefined;

function element(id: string) {
  const node = document.getElementById(id);
  if (!node) throw new Error(`Missing demo element "${id}".`);
  return node;
}

function retryButton() {
  return element('collabRetry') as HTMLButtonElement;
}

function bridge() {
  const value = mocks.add.mock.calls
    .flat()
    .find((object) => object.remoteSelections instanceof Map);
  if (!value) throw new Error('The collaboration bridge was not added.');
  return value as Bridge;
}

function dispatch(target: THREE.Object3D, event: object) {
  // The public addon mock deliberately models both inherited and addon events.
  target.dispatchEvent(event as THREE.BaseEvent);
}

function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return {promise, resolve};
}

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState({}, '', '/demos/roomcraft/');
  document.body.innerHTML = html.match(/<body>([\s\S]*)<\/body>/)![1];
  session = new Session();
  net = {
    session: undefined,
    joinRoom: vi.fn(async () => {
      net.session = session;
      return session;
    }),
    leaveRoom: vi.fn(() => {
      net.session?.close();
      net.session = undefined;
    }),
  };
  mocks.enableNet.mockReturnValue(net);
  mocks.init.mockResolvedValue(undefined);
  mocks.bridgeInit.mockResolvedValue(undefined);
  vi.spyOn(RoomcraftConsole.prototype, 'start').mockResolvedValue(undefined);
  vi.spyOn(RoomcraftConsole.prototype, 'refresh').mockImplementation(() => {});
  vi.spyOn(
    RoomcraftConsole.prototype,
    'restoreEntryVisibility'
  ).mockImplementation(() => {});
  vi.spyOn(RoomcraftConsole.prototype, 'showError').mockImplementation(
    function (this: {errorMessage: string}, error: Error) {
      this.errorMessage = error.message;
    }
  );
});

afterEach(() => {
  consoleScript?.dispose();
  consoleScript = undefined;
  vi.restoreAllMocks();
});

describe('optional collaboration startup', () => {
  it.each(['', '?collab=0', '?collab=true', '?collab=01', '?collab='])(
    'does not load the networking module for %s',
    async (query) => {
      window.history.replaceState({}, '', `/demos/roomcraft/${query}`);
      consoleScript = await startRoomcraftDemo();
      expect(mocks.netModuleLoaded).not.toHaveBeenCalled();
      expect(mocks.enableNet).not.toHaveBeenCalled();
      expect(mocks.initScript).not.toHaveBeenCalled();
      expect(element('collaboration').hidden).toBe(true);
      expect(consoleScript.isBusy()).toBe(false);
    }
  );

  it('waits for SDK startup and local scene/key setup before enabling networking', async () => {
    const sdk = deferred();
    const local = deferred();
    mocks.init.mockReturnValueOnce(sdk.promise);
    const start = vi.mocked(RoomcraftConsole.prototype.start);
    start.mockReturnValueOnce(local.promise);
    window.history.replaceState({}, '', '?collab=1&key=private');
    const starting = startRoomcraftDemo();
    expect(start).not.toHaveBeenCalled();
    expect(mocks.netModuleLoaded).not.toHaveBeenCalled();
    sdk.resolve();
    await sdk.promise;
    expect(start).toHaveBeenCalledOnce();
    expect(mocks.enableNet).not.toHaveBeenCalled();
    expect(mocks.netModuleLoaded).not.toHaveBeenCalled();
    local.resolve();
    consoleScript = await starting;
    expect(mocks.enableNet).toHaveBeenCalledOnce();
    expect(net.joinRoom).toHaveBeenCalledWith('roomcraft:room:roomcraft-demo', {
      transport: expect.any(EventTarget),
      displayName: expect.stringMatching(/^Maker [\da-f]{4}$/),
      role: 'user',
    });
    expect(mocks.initScript).toHaveBeenCalledWith(bridge());
    expect(consoleScript.room.busy).toBe(false);
    expect(consoleScript.isBusy()).toBe(false);
  });

  it('keeps virtual and nonvirtual tabs in distinct rooms', async () => {
    window.history.replaceState({}, '', '?collab=1&room=garden&environment=1');
    consoleScript = await startRoomcraftDemo();
    expect(net.joinRoom.mock.calls[0][0]).toBe('roomcraft:virtual:garden');
    expect(consoleScript.virtual).toBe(true);
    expect(consoleScript.room.position.z).toBe(0);
  });

  it('generates a name on HTTP LAN pages without secure-context randomUUID', async () => {
    vi.spyOn(crypto, 'randomUUID').mockImplementation(() => {
      throw new Error('Unavailable outside a secure context');
    });
    window.history.replaceState({}, '', '?collab=1');
    consoleScript = await startRoomcraftDemo();
    expect(net.joinRoom.mock.calls[0][1].displayName).toMatch(
      /^Maker [\da-f]{4}$/
    );
  });

  it('does not start collaboration after the page has already been left', async () => {
    vi.mocked(RoomcraftConsole.prototype.start).mockImplementationOnce(
      function (this: {pageLeft: boolean}) {
        this.pageLeft = true;
        return Promise.resolve();
      }
    );
    window.history.replaceState({}, '', '?collab=1');
    consoleScript = await startRoomcraftDemo();
    expect(mocks.enableNet).not.toHaveBeenCalled();
    expect(element('collaboration').hidden).toBe(true);
  });
});

describe('collaboration URL configuration', () => {
  it('uses exact opt-in and bounded names and room IDs', async () => {
    // @ts-expect-error The executable browser demo is a JavaScript consumer.
    const {collaborationOptions} = await import(
      '../../../demos/roomcraft/Collaboration.js'
    );
    expect(
      collaborationOptions('https://example.test/?collab=true')
    ).toBeNull();
    expect(() =>
      collaborationOptions(
        `https://example.test/?collab=1&room=${'a'.repeat(49)}`
      )
    ).toThrow('Room IDs');
    const options = collaborationOptions(
      'https://example.test/?collab=1&name=%20Alice%20%20Maker%20'
    );
    expect(options).toMatchObject({
      room: 'roomcraft-demo',
      roomId: 'roomcraft:room:roomcraft-demo',
      displayName: 'Alice Maker',
    });
    expect(
      collaborationOptions(
        `https://example.test/?collab=1&room=Studio_4-A&name=${'n'.repeat(100)}`,
        true
      )
    ).toMatchObject({
      roomId: 'roomcraft:virtual:Studio_4-A',
      displayName: 'n'.repeat(40),
    });
  });

  it('builds a fresh peer URL that strips credentials, keys and nested URLs', async () => {
    // @ts-expect-error The executable browser demo is a JavaScript consumer.
    const {collaborationOptions, collaborationPeerUrl} = await import(
      '../../../demos/roomcraft/Collaboration.js'
    );
    const url =
      'https://user:password@example.test/demos/roomcraft/?collab=1&room=studio&name=Alice&environment=1&key=secret&geminiKey=secret2&scene=./key.json?key=secret3&debug=1&xrAutomation=1&formFactor=desktop&token=secret4#secret5';
    const peer = new URL(
      collaborationPeerUrl(url, collaborationOptions(url, true))
    );
    expect(peer.origin).toBe('https://example.test');
    expect(peer.pathname).toBe('/demos/roomcraft/');
    expect(peer.username).toBe('');
    expect(peer.password).toBe('');
    expect(peer.hash).toBe('');
    expect(Object.fromEntries(peer.searchParams)).toEqual({
      collab: '1',
      room: 'studio',
      environment: '1',
      formFactor: 'desktop',
      debug: '1',
      xrAutomation: '1',
    });
  });
});

describe('collaboration panel', () => {
  beforeEach(async () => {
    window.history.replaceState({}, '', '?collab=1&room=studio&name=Alice');
    consoleScript = await startRoomcraftDemo();
  });

  it('shows identity, colored roster, peer selections and departures safely', () => {
    expect(element('collaboration').hidden).toBe(false);
    expect(element('collabIdentity').textContent).toBe(
      'Alice · roomcraft:room:studio'
    );
    expect(element('collabStatus').dataset.state).toBe('ready');
    expect(element('collabPeers').textContent).toContain('Alice (you)');
    session.users.set('bob', {peerId: 'bob', displayName: '<img src=x>Bob'});
    session.dispatchEvent(new CustomEvent('user-join'));
    expect(element('collabPeers').textContent).toContain('<img src=x>Bob');
    expect(element('collabPeers').querySelector('img')).toBeNull();
    expect(
      element('collabPeers')
        .querySelector('li')
        ?.style.getPropertyValue('--rc-peer-color')
    ).toBe('#e8714a');
    bridge().remoteSelections.set('bob', 'chair');
    dispatch(bridge(), {type: 'selectionchange', peerId: 'bob', id: 'chair'});
    expect(element('collabPeers').textContent).toContain(
      'Selected: Reading chair'
    );
    session.users.delete('bob');
    session.dispatchEvent(new CustomEvent('user-leave'));
    expect(element('collabPeers').textContent).not.toContain('Bob');
    const link = element('collabLink') as HTMLAnchorElement;
    expect(link.rel).toBe('noopener noreferrer');
    expect(link.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(new URL(link.href).searchParams.has('name')).toBe(false);
  });

  it('reflects bridge queues without marking Roomcraft busy or deadlocking bootstrap', () => {
    const sync = bridge();
    sync.status = 'syncing';
    sync.pendingCount = 2;
    dispatch(sync, {type: 'statuschange', status: 'syncing', pendingCount: 2});
    expect(element('collabStatus').textContent).toContain('2 pending');
    expect(consoleScript.isBusy()).toBe(true);
    expect(consoleScript.room.busy).toBe(false);
    expect(retryButton().disabled).toBe(true);
    sync.status = 'ready';
    sync.pendingCount = 0;
    dispatch(sync, {type: 'statuschange', status: 'ready', pendingCount: 0});
    expect(consoleScript.isBusy()).toBe(false);
    expect(retryButton().disabled).toBe(false);
  });

  it('shows sync failures through the existing console and retries the bridge', () => {
    const sync = bridge();
    sync.status = 'error';
    dispatch(sync, {
      type: 'error',
      error: new Error('Scene exceeds the 60 KB message cap.'),
      operation: 'publish',
    });
    expect(consoleScript.showError).toHaveBeenCalledWith(expect.any(Error));
    expect(element('collabStatus').textContent).toContain('60 KB message cap');
    expect(element('collabStatus').dataset.state).toBe('error');
    retryButton().click();
    expect(sync.resync).toHaveBeenCalledOnce();
    expect(consoleScript.errorMessage).toBe('');
    expect(net.joinRoom).toHaveBeenCalledOnce();
  });

  it('rejoins after a closed session and disposes only its own connection', async () => {
    const old = bridge();
    session.close();
    expect(old.dispose).toHaveBeenCalledOnce();
    expect(element('collabStatus').dataset.state).toBe('closed');
    expect(consoleScript.isBusy()).toBe(false);
    session = new Session();
    await consoleScript.collaboration.retry();
    expect(net.joinRoom).toHaveBeenCalledTimes(2);
    expect(element('collabStatus').dataset.state).toBe('ready');
    const other = new Session();
    net.session = other;
    consoleScript.dispose();
    expect(session.close).toHaveBeenCalledOnce();
    expect(other.close).not.toHaveBeenCalled();
  });

  it('cleans up listeners, session and bridge once on pagehide or disposal', () => {
    const sync = bridge();
    const refresh = vi.mocked(consoleScript.refresh);
    window.dispatchEvent(new Event('pagehide'));
    const afterCleanup = refresh.mock.calls.length;
    expect(sync.dispose).toHaveBeenCalledOnce();
    expect(session.close).toHaveBeenCalledOnce();
    expect(element('collabStatus').dataset.state).toBe('closed');
    expect(retryButton().disabled).toBe(true);
    dispatch(sync, {
      type: 'error',
      error: new Error('late'),
      operation: 'sync',
    });
    session.dispatchEvent(new Event('user-join'));
    dispatch(consoleScript.room, {type: 'statuschange', status: 'loading'});
    expect(refresh.mock.calls.length).toBe(afterCleanup);
    consoleScript.dispose();
    expect(sync.dispose).toHaveBeenCalledOnce();
    expect(session.close).toHaveBeenCalledOnce();
  });
});

describe('collaboration startup failures', () => {
  it('waits for bridge initialization before reading peer colors', async () => {
    const initialized = deferred();
    mocks.bridgeInit.mockReturnValueOnce(initialized.promise);
    window.history.replaceState({}, '', '?collab=1');
    const starting = startRoomcraftDemo();
    await vi.waitFor(() => expect(mocks.initScript).toHaveBeenCalledOnce());
    const color = vi.spyOn(bridge(), 'getPeerColor');
    session.users.set('bob', {peerId: 'bob', displayName: 'Bob'});
    session.dispatchEvent(new Event('user-join'));
    dispatch(bridge(), {
      type: 'statuschange',
      status: 'ready',
      pendingCount: 0,
    });
    expect(color).not.toHaveBeenCalled();
    initialized.resolve();
    consoleScript = await starting;
    expect(color).toHaveBeenCalled();
    expect(element('collabPeers').textContent).toContain('Bob');
  });

  it('keeps the local scene usable and allows connection retry', async () => {
    net.joinRoom.mockRejectedValueOnce(
      new Error('BroadcastChannel unavailable')
    );
    window.history.replaceState({}, '', '?collab=1');
    consoleScript = await startRoomcraftDemo();
    expect(consoleScript.errorMessage).toContain(
      'BroadcastChannel unavailable'
    );
    expect(consoleScript.isBusy()).toBe(false);
    expect(element('collabStatus').dataset.state).toBe('error');
    await consoleScript.collaboration.retry();
    expect(element('collabStatus').dataset.state).toBe('ready');
  });

  it('closes a session that finishes joining after pagehide', async () => {
    const joined = deferred();
    net.joinRoom.mockImplementationOnce(async () => {
      net.session = session;
      await joined.promise;
      session.isOpen = true;
      return session;
    });
    window.history.replaceState({}, '', '?collab=1');
    const starting = startRoomcraftDemo();
    await vi.waitFor(() => expect(net.joinRoom).toHaveBeenCalledOnce());
    window.dispatchEvent(new Event('pagehide'));
    joined.resolve();
    consoleScript = await starting;
    expect(session.isOpen).toBe(false);
    expect(mocks.initScript).not.toHaveBeenCalled();
    expect(consoleScript.isBusy()).toBe(false);
    expect(element('collabStatus').dataset.state).toBe('closed');
  });
});
