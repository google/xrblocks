import * as THREE from 'three';
import {readFileSync} from 'node:fs';
import {BroadcastChannel as NodeBroadcastChannel} from 'node:worker_threads';
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
  resumePlayback: vi.fn(async () => {}),
  spatialStates: [] as unknown[],
  spatialControllers: [] as object[],
}));

vi.mock('../../../demos/roomcraft/CollaborationSpatial.js', () => ({
  CollaborationSpatialView: class {
    private readonly unsubscribe: () => void;
    constructor(
      _host: object,
      controller: {
        subscribe: (listener: (state: unknown) => void) => () => void;
      }
    ) {
      mocks.spatialControllers.push(controller);
      this.unsubscribe = controller.subscribe((state) =>
        mocks.spatialStates.push(state)
      );
    }
    dispose() {
      this.unsubscribe();
    }
  },
}));

vi.mock('xrblocks', async () => {
  const {Object3D} = await import('three');
  class FakeUIElement extends Object3D {
    dispose() {}
  }
  return {
    Script: Object3D,
    StylizedFace: FakeUIElement,
    UICard: FakeUIElement,
    UIText: class extends FakeUIElement {
      text = '';
    },
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
    core: {
      renderer: {shadowMap: {}},
      sound: {listener: {context: {resume: mocks.resumePlayback}}},
    },
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
  class MockTransport extends EventTarget {
    close = vi.fn();
    remotePeerIds = new Set<string>();
    constructor(readonly options?: object) {
      super();
    }
  }
  return {
    enableNet: mocks.enableNet,
    BroadcastChannelTransport: class extends MockTransport {},
    WebRTCTransport: class extends MockTransport {},
    WebSocketTransport: class extends MockTransport {},
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
  users = new Map<
    string,
    {peerId: string; displayName: string; avatar?: {voiceActive: boolean}}
  >();
  transport!: EventTarget & {remotePeerIds: Set<string>};
  voiceOn = false;
  voiceMuted = false;
  playbackMuted = false;
  peerPlaybackMuted = new Set<string>();
  setPlaybackMuted = vi.fn((muted: boolean) => {
    if (this.playbackMuted === muted) return;
    this.playbackMuted = muted;
    this.dispatchEvent(new CustomEvent('playback-state', {detail: {muted}}));
  });
  setPeerPlaybackMuted = vi.fn((id: string, muted: boolean) => {
    if (muted) this.peerPlaybackMuted.add(id);
    else this.peerPlaybackMuted.delete(id);
    this.dispatchEvent(
      new CustomEvent('playback-state', {detail: {peerId: id, muted}})
    );
  });
  isPeerPlaybackMuted = (id: string) => this.peerPlaybackMuted.has(id);
  voice = {
    isEnabled: () => this.voiceOn,
    isMuted: () => !this.voiceOn || this.voiceMuted,
    setMuted: vi.fn((muted: boolean) => {
      this.voiceMuted = muted;
      this.dispatchEvent(
        new CustomEvent('local-voice-state', {detail: {on: !muted}})
      );
    }),
    enable: vi.fn(async () => this.setVoice(true)),
    cancelPendingEnable: vi.fn(),
    disable: vi.fn(() => this.setVoice(false)),
  };
  setVoice(on: boolean) {
    this.voiceOn = on;
    this.voiceMuted = false;
    this.dispatchEvent(new CustomEvent('local-voice-state', {detail: {on}}));
  }
  close = vi.fn(() => {
    if (!this.isOpen) return;
    this.isOpen = false;
    this.voice.disable();
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

function setField(id: string, value: string) {
  (element(id) as HTMLInputElement).value = value;
  element(id).dispatchEvent(
    new Event(id === 'collabTransport' ? 'change' : 'input', {bubbles: true})
  );
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
  mocks.spatialStates.length = 0;
  mocks.spatialControllers.length = 0;
  window.history.replaceState({}, '', '/demos/roomcraft/');
  document.body.innerHTML = html.match(/<body>([\s\S]*)<\/body>/)![1];
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('RTCPeerConnection', class {});
  Object.defineProperty(navigator, 'mediaDevices', {
    configurable: true,
    value: {getUserMedia: vi.fn()},
  });
  session = new Session();
  net = {
    session: undefined,
    joinRoom: vi.fn(async (_roomId, options) => {
      net.session = session;
      session.transport = options.transport;
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
  mocks.resumePlayback.mockResolvedValue(undefined);
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
  vi.unstubAllGlobals();
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
  it('reproduces named Bob versus unnamed peer links over real BroadcastChannel sessions', async () => {
    // @ts-expect-error The executable browser demo is a JavaScript consumer.
    const {collaborationOptions, collaborationPeerUrl} = await import(
      '../../../demos/roomcraft/Collaboration.js'
    );
    const {NetSession} = await import('../netblocks/src/core/NetSession');
    const {BroadcastChannelTransport} = await import(
      '../netblocks/src/core/transport/BroadcastChannelTransport'
    );
    vi.stubGlobal('BroadcastChannel', NodeBroadcastChannel);
    const aliceUrl =
      'https://example.test/?collab=1&room=roster-regression&name=Alice';
    const aliceOptions = collaborationOptions(aliceUrl);
    const peerUrl = collaborationPeerUrl(aliceUrl, aliceOptions);
    const generated = collaborationOptions(peerUrl);
    const named = collaborationOptions(`${peerUrl}&name=Bob`);
    const alice = new NetSession(
      new BroadcastChannelTransport(),
      new THREE.Group(),
      aliceOptions
    );
    const bob = new NetSession(
      new BroadcastChannelTransport(),
      new THREE.Group(),
      named
    );
    const maker = new NetSession(
      new BroadcastChannelTransport(),
      new THREE.Group(),
      generated
    );
    try {
      await alice.open(aliceOptions.roomId);
      await bob.open(named.roomId);
      await vi.waitFor(() =>
        expect(alice.users.get(bob.localPeerId)?.displayName).toBe('Bob')
      );
      await maker.open(generated.roomId);
      await vi.waitFor(() =>
        expect(alice.users.get(maker.localPeerId)?.displayName).toBe(
          generated.displayName
        )
      );
      expect(generated.displayName).toMatch(/^Maker [\da-f]{4}$/);
      expect(alice.users.get(bob.localPeerId)?.displayName).toBe('Bob');
    } finally {
      alice.close();
      bob.close();
      maker.close();
    }
  });

  it('retains the legacy default and shares only allowlisted transport settings', async () => {
    // @ts-expect-error The executable browser demo is a JavaScript consumer.
    const {collaborationOptions, collaborationPeerUrl} = await import(
      '../../../demos/roomcraft/Collaboration.js'
    );
    const source =
      'https://example.test/demo?collab=1&transport=webrtc&key=private&relay=wss://ignored.test/?key=private&signalingUrl=private#private';
    expect(
      collaborationOptions('https://example.test/?collab=1').transport
    ).toBe('broadcast');
    const peer = new URL(
      collaborationPeerUrl(source, collaborationOptions(source))
    );
    expect(Object.fromEntries(peer.searchParams)).toEqual({
      collab: '1',
      room: 'roomcraft-demo',
      transport: 'webrtc',
    });
    const relaySource =
      'https://example.test/?collab=1&transport=websocket&relay=wss%3A%2F%2Frelay.example%2Froomcraft&key=private';
    const relayPeer = new URL(
      collaborationPeerUrl(relaySource, collaborationOptions(relaySource))
    );
    expect(relayPeer.searchParams.get('relay')).toBe(
      'wss://relay.example/roomcraft'
    );
    expect(relayPeer.href).not.toContain('private');
    expect(() =>
      collaborationOptions('https://example.test/?collab=1&transport=invalid')
    ).toThrow('Choose');
  });

  it.each([
    ['https://example.test/', 'ws://relay.example', 'wss://'],
    ['https://example.test/', 'https://relay.example', 'ws://'],
    ['https://example.test/', '/relay', 'explicit'],
    ['https://example.test/', '', 'explicit'],
    [
      'https://example.test/',
      'wss://user:password@relay.example',
      'credentials',
    ],
    ['https://example.test/', 'wss://relay.example?key=private', 'credentials'],
    [
      'https://example.test/',
      'wss://relay.example?target=https://other/?key=private',
      'credentials',
    ],
    ['https://example.test/', 'wss://relay.example#private', 'credentials'],
  ])(
    'rejects unsafe relay configuration on %s',
    async (page, relay, message) => {
      // @ts-expect-error The executable browser demo is a JavaScript consumer.
      const {collaborationRelayUrl} = await import(
        '../../../demos/roomcraft/Collaboration.js'
      );
      expect(() => collaborationRelayUrl(relay, page)).toThrow(message);
    }
  );

  it('accepts an explicit secure relay and permits WS only on HTTP pages', async () => {
    // @ts-expect-error The executable browser demo is a JavaScript consumer.
    const {collaborationRelayUrl} = await import(
      '../../../demos/roomcraft/Collaboration.js'
    );
    expect(
      collaborationRelayUrl('wss://relay.example/rooms', 'https://example.test')
    ).toBe('wss://relay.example/rooms');
    expect(
      collaborationRelayUrl('ws://localhost:8081', 'http://localhost')
    ).toBe('ws://localhost:8081/');
  });

  it('announces Bob only on a named URL; a generated peer link gets its own Maker name', async () => {
    // @ts-expect-error The executable browser demo is a JavaScript consumer.
    const {collaborationOptions, collaborationPeerUrl} = await import(
      '../../../demos/roomcraft/Collaboration.js'
    );
    const alice = 'https://example.test/?collab=1&room=studio&name=Alice';
    const peer = collaborationPeerUrl(alice, collaborationOptions(alice));
    const generated = collaborationOptions(peer);
    expect(generated.displayName).toMatch(/^Maker [\da-f]{4}$/);
    const bob = new URL(peer);
    bob.searchParams.set('name', 'Bob');
    expect(collaborationOptions(bob.href).displayName).toBe('Bob');
    window.history.replaceState({}, '', bob.pathname + bob.search);
    consoleScript = await startRoomcraftDemo();
    expect(net.joinRoom.mock.calls[0][1].displayName).toBe('Bob');
    expect(element('collabPeers').textContent).toContain('Bob (you)');
  });

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

  it('discards unapplied settings without reconnecting or changing audio/authoring', async () => {
    const controller = consoleScript.collaboration;
    const prompt = element('prompt') as HTMLTextAreaElement;
    prompt.value = 'keep this authoring draft';
    prompt.setSelectionRange(3, 8);
    consoleScript.promptValue = prompt.value;
    consoleScript.room.selectedId = 'chair';
    await controller.toggleVoice();
    controller.togglePlayback();
    controller.setDraft('name', 'Unapplied name');
    controller.setDraft('transport', 'websocket');
    controller.setDraft('relay', 'wss://relay.example/');
    expect(controller.getState().draftDirty).toBe(true);
    expect(element('collabDraftIndicator').hidden).toBe(false);
    expect(element('collabReset').textContent?.trim()).toBe('Discard changes');
    expect(element('collabReset').title).toContain(
      'Discard unapplied name, transport and relay edits.'
    );
    controller.reportError(new Error('Bad relay draft'), 'configuration');
    element('collabReset').click();
    expect(controller.getState()).toMatchObject({
      draft: {name: 'Alice', transport: 'broadcast', relay: ''},
      draftDirty: false,
      error: '',
      listening: {muted: true},
      microphone: {transmitting: true},
    });
    expect(mocks.spatialStates.at(-1)).toMatchObject({draftDirty: false});
    expect(element('collabDraftIndicator').hidden).toBe(true);
    expect((element('collabReset') as HTMLButtonElement).disabled).toBe(true);
    expect(net.joinRoom).toHaveBeenCalledOnce();
    expect(session.voice.enable).toHaveBeenCalledOnce();
    expect(session.voice.disable).not.toHaveBeenCalled();
    expect(session.voice.setMuted).not.toHaveBeenCalled();
    expect(prompt.value).toBe('keep this authoring draft');
    expect([prompt.selectionStart, prompt.selectionEnd]).toEqual([3, 8]);
    expect(consoleScript.room.selectedId).toBe('chair');
    expect(consoleScript.statusMessage).toBe(
      'Unapplied connection changes discarded. Connection, scene, prompt and audio are unchanged.'
    );
  });

  it('does not clear an unrelated connection/playback error when resetting a draft', () => {
    const controller = consoleScript.collaboration;
    controller.setDraft('name', 'Unapplied');
    controller.reportError(new Error('Draft failed'), 'configuration');
    controller.reportError(new Error('Playback blocked'), 'playback');
    controller.resetDraft();
    expect(controller.getState().draftDirty).toBe(false);
    expect(controller.getState().error).toContain('Playback blocked');
  });

  it('marks relay edits only when the selected transport uses a relay', () => {
    const controller = consoleScript.collaboration;
    controller.setDraft('relay', 'wss://relay.example/');
    expect(controller.getState().draftDirty).toBe(false);
    controller.setDraft('transport', 'websocket');
    expect(controller.getState().draftDirty).toBe(true);
    controller.setDraft('transport', 'broadcast');
    expect(controller.getState().draftDirty).toBe(false);
    controller.setDraft('name', 'Unapplied');
    controller.setDraft('name', 'Alice');
    expect(controller.getState().draftDirty).toBe(false);
    expect(net.joinRoom).toHaveBeenCalledOnce();
  });

  it('keeps common audio controls before the roster and preserves the settings disclosure', () => {
    const settings = element('collabSettings') as HTMLDetailsElement;
    expect(settings.open).toBe(false);
    expect(
      element('collabVoice').compareDocumentPosition(element('collabPeers')) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).not.toBe(0);
    expect(
      element('collabPlayback').compareDocumentPosition(
        element('collabPeers')
      ) & Node.DOCUMENT_POSITION_FOLLOWING
    ).not.toBe(0);
    settings.open = true;
    consoleScript.collaboration.render();
    expect(settings.open).toBe(true);
    settings.open = false;
    consoleScript.collaboration.reportError(
      new Error('Invalid relay'),
      'configuration'
    );
    expect(settings.open).toBe(true);
  });

  it('shares draft state and actions with the spatial subscriber without touching authoring', () => {
    const controller = consoleScript.collaboration;
    const prompt = element('prompt') as HTMLTextAreaElement;
    prompt.value = 'keep my authoring draft';
    prompt.setSelectionRange(5, 11, 'backward');
    consoleScript.promptValue = prompt.value;
    consoleScript.room.selectedId = 'chair';
    const generate = vi.spyOn(consoleScript, 'generate');
    expect(mocks.spatialControllers).toContain(controller);
    setField('collabName', 'Bob');
    expect(controller.getState()).toMatchObject({
      draft: {name: 'Bob'},
      applied: {name: 'Alice'},
    });
    expect(mocks.spatialStates.at(-1)).toMatchObject({draft: {name: 'Bob'}});
    controller.setDraft('transport', 'websocket');
    controller.setDraft('relay', 'ws://relay.example/room');
    expect((element('collabTransport') as HTMLSelectElement).value).toBe(
      'websocket'
    );
    expect((element('collabRelay') as HTMLInputElement).value).toBe(
      'ws://relay.example/room'
    );
    expect(prompt.value).toBe('keep my authoring draft');
    expect([
      prompt.selectionStart,
      prompt.selectionEnd,
      prompt.selectionDirection,
    ]).toEqual([5, 11, 'backward']);
    expect(consoleScript.room.selectedId).toBe('chair');
    expect(generate).not.toHaveBeenCalled();
    expect(net.joinRoom).toHaveBeenCalledOnce();
  });

  it('does not mutate the DOM, replace rows, lose focus or notify spatial views on no-op renders', () => {
    session.users.set('bob', {peerId: 'bob', displayName: 'Bob'});
    session.dispatchEvent(new Event('user-join'));
    const list = element('collabPeers');
    const rows = [...list.children];
    const button = list.querySelector(
      '[data-peer-id="bob"] button'
    ) as HTMLButtonElement;
    button.focus();
    const states = mocks.spatialStates.length;
    const refreshes = vi.mocked(consoleScript.refresh).mock.calls.length;
    const observer = new MutationObserver(() => {});
    observer.observe(element('collaboration'), {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    });
    for (let i = 0; i < 10; i++) consoleScript.collaboration.render();
    expect(observer.takeRecords()).toHaveLength(0);
    observer.disconnect();
    expect([...list.children]).toEqual(rows);
    expect(document.activeElement).toBe(button);
    expect(mocks.spatialStates).toHaveLength(states);
    expect(vi.mocked(consoleScript.refresh)).toHaveBeenCalledTimes(refreshes);
  });

  it('surfaces blocked incoming playback without acquiring or changing my microphone', async () => {
    mocks.resumePlayback.mockRejectedValueOnce(new Error('Playback blocked'));
    const controller = consoleScript.collaboration;
    controller.togglePlayback();
    controller.togglePlayback();
    await Promise.resolve();
    expect(controller.getState().error).toContain('Playback blocked');
    expect(mocks.spatialStates.at(-1)).toMatchObject({
      error: expect.stringContaining('Playback blocked'),
    });
    expect(session.voice.enable).not.toHaveBeenCalled();
    expect(session.voice.setMuted).not.toHaveBeenCalled();
    expect(session.voice.disable).not.toHaveBeenCalled();
  });

  it('keeps incoming master and individual choices separate from my mic and remote announcements', async () => {
    session.users.set('bob', {
      peerId: 'bob',
      displayName: 'Bob',
      avatar: {voiceActive: true},
    });

    session.users.set('charlie', {
      peerId: 'charlie',
      displayName: 'Charlie',
      avatar: {voiceActive: true},
    });
    session.dispatchEvent(new Event('user-join'));
    const controller = consoleScript.collaboration;
    await controller.toggleVoice();
    controller.togglePeerPlayback('bob');
    controller.togglePlayback();
    expect(session.playbackMuted).toBe(true);
    expect(session.isPeerPlaybackMuted('bob')).toBe(true);
    controller.togglePlayback();
    expect(session.playbackMuted).toBe(false);
    expect(session.isPeerPlaybackMuted('bob')).toBe(true);
    expect(session.isPeerPlaybackMuted('charlie')).toBe(false);
    expect(session.voice.isMuted()).toBe(false);
    expect(session.voice.enable).toHaveBeenCalledOnce();
    expect(session.voice.setMuted).not.toHaveBeenCalled();
    expect(session.voice.disable).not.toHaveBeenCalled();
    expect(mocks.spatialStates.at(-1)).toMatchObject({
      listening: {muted: false},
      participants: expect.arrayContaining([
        expect.objectContaining({id: 'bob', micOn: true, mutedForMe: true}),
        expect.objectContaining({
          id: 'charlie',
          micOn: true,
          mutedForMe: false,
        }),
      ]),
    });
    controller.togglePlayback();
    session = new Session();
    await controller.reconnect();
    expect(session.setPlaybackMuted).toHaveBeenCalledWith(true);
    expect(session.voice.enable).not.toHaveBeenCalled();
  });

  it.each([false, true])(
    'applies a listening change during a pending connection (initial mute=%s)',
    async (initial) => {
      const controller = consoleScript.collaboration;
      if (initial) controller.togglePlayback();
      session = new Session();
      session.isOpen = false;
      const gate = deferred();
      net.joinRoom.mockImplementationOnce(async (_room, options) => {
        net.session = session;
        session.transport = options.transport;
        await gate.promise;
        session.isOpen = true;
        return session;
      });
      const connecting = controller.reconnect();
      expect(controller.joining).toBe(true);
      controller.togglePlayback();
      expect(session.playbackMuted).toBe(!initial);
      gate.resolve();
      await connecting;
      expect(controller.getState().listening.muted).toBe(!initial);
      expect(session.playbackMuted).toBe(!initial);
      expect(session.voice.enable).not.toHaveBeenCalled();
    }
  );

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

  it('refreshes late metadata without inventing a name for an actual Maker peer', () => {
    session.users.set('unknown', {peerId: 'unknown', displayName: ''});
    session.users.set('maker', {peerId: 'maker', displayName: 'Maker 1234'});
    session.dispatchEvent(new Event('user-join'));
    expect(element('collabPeers').textContent).toContain('Maker 1234');
    expect(element('collabPeers').textContent).not.toContain('Bob');
    session.users.get('unknown')!.displayName = 'Bob';
    session.dispatchEvent(new Event('user-update'));
    expect(element('collabPeers').textContent).toContain('Bob');
    expect(element('collabPeers').textContent).toContain('Maker 1234');
  });

  it('switches transports and announced name without replacing the authored scene', async () => {
    const room = consoleScript.room;
    room.position.set(1, 2, 3);
    room.selectedId = 'chair';
    const layout = room.layout;
    const oldBridge = bridge();
    const oldSession = session;
    const geminiVoice = consoleScript.voice;
    const originalUrl = window.location.href;
    setField('collabTransport', 'webrtc');
    setField('collabName', ' Bob ');
    session = new Session();
    await consoleScript.collaboration.reconnect();
    // @ts-expect-error The executable browser demo uses this public addon entry.
    const {WebRTCTransport, WebSocketTransport} = await import(
      'xrblocks/addons/netblocks/src/index.js'
    );
    expect(net.joinRoom.mock.calls[1][1]).toMatchObject({
      displayName: 'Bob',
      transport: expect.any(WebRTCTransport),
    });
    expect(oldSession.close).toHaveBeenCalledOnce();
    expect(oldSession.voice.disable).toHaveBeenCalled();
    expect(oldBridge.dispose).toHaveBeenCalledOnce();
    expect(consoleScript.room).toBe(room);
    expect(room.layout).toBe(layout);
    expect(room.position.toArray()).toEqual([1, 2, 3]);
    expect(room.selectedId).toBe('chair');
    expect(window.location.href).toBe(originalUrl);
    expect(consoleScript.voice).toBe(geminiVoice);
    expect(element('collabPeers').textContent).toContain('Bob (you)');
    expect(element('collabStatus').textContent).toContain('WebRTC');
    expect(
      new URL(
        (element('collabLink') as HTMLAnchorElement).href
      ).searchParams.get('transport')
    ).toBe('webrtc');
    setField('collabTransport', 'websocket');
    setField('collabRelay', 'wss://relay.example/roomcraft');
    session = new Session();
    await consoleScript.collaboration.reconnect();
    expect(net.joinRoom.mock.calls[2][1].transport).toBeInstanceOf(
      WebSocketTransport
    );
    expect(net.joinRoom.mock.calls[2][1].transport.options).toEqual({
      url: 'wss://relay.example/roomcraft',
      reconnectAttempts: 0,
    });
    expect(room.layout).toBe(layout);
    expect(session.voice.enable).not.toHaveBeenCalled();
    expect(element('collabVoice').textContent).toBe('Unmute my mic');
  });

  it('validates before disconnecting and keeps configuration editable', async () => {
    const old = session;
    setField('collabTransport', 'websocket');
    setField('collabRelay', 'wss://relay.example?key=private');
    element('collabTransport').dispatchEvent(new Event('change'));
    expect(element('collabRelayField').hidden).toBe(false);
    await consoleScript.collaboration.reconnect();
    expect(old.close).not.toHaveBeenCalled();
    expect(net.joinRoom).toHaveBeenCalledOnce();
    expect(element('collabStatus').textContent).toContain(
      'without credentials'
    );
    expect(element('collabStatus').textContent).not.toContain('private');
    setField('collabTransport', 'broadcast');
    setField('collabName', '\u0000  ');
    await consoleScript.collaboration.reconnect();
    expect(net.joinRoom).toHaveBeenCalledOnce();
    expect(element('collabStatus').textContent).toContain('display name');
  });

  it('applies editable display names through the in-app connection form', async () => {
    setField('collabName', 'Bob');
    session = new Session();
    const submit = new Event('submit', {cancelable: true});
    element('collabConnection').dispatchEvent(submit);
    expect(submit.defaultPrevented).toBe(true);
    await vi.waitFor(() =>
      expect(element('collabPeers').textContent).toContain('Bob (you)')
    );
    expect(net.joinRoom.mock.calls[1][1].displayName).toBe('Bob');
  });

  it('does not let a hidden invalid relay field block another transport', () => {
    setField('collabTransport', 'websocket');
    element('collabTransport').dispatchEvent(new Event('change'));
    setField('collabRelay', 'not a URL');
    expect(
      (element('collabConnection') as HTMLFormElement).checkValidity()
    ).toBe(false);
    setField('collabTransport', 'webrtc');
    element('collabTransport').dispatchEvent(new Event('change'));
    expect(
      (element('collabConnection') as HTMLFormElement).checkValidity()
    ).toBe(true);
    expect((element('collabRelay') as HTMLInputElement).disabled).toBe(true);
  });

  it('surfaces transport errors and explicit leave does not dispose local content', () => {
    const room = consoleScript.room;
    const old = session;
    session.transport.dispatchEvent(
      new CustomEvent('error', {
        detail: {error: new Error('Broker unavailable')},
      })
    );
    expect(element('collabStatus').textContent).toContain('Broker unavailable');
    (element('collabLeave') as HTMLButtonElement).click();
    expect(old.close).toHaveBeenCalledOnce();
    expect(consoleScript.room).toBe(room);
    expect(element('collabStatus').textContent).toContain('local scene');
    expect(element('collabPeers').textContent).toBe('');
    expect((element('collabVoice') as HTMLButtonElement).disabled).toBe(true);
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
    session.dispatchEvent(new Event('user-update'));
    dispatch(consoleScript.room, {type: 'statuschange', status: 'loading'});
    expect(refresh.mock.calls.length).toBe(afterCleanup);
    consoleScript.dispose();
    expect(sync.dispose).toHaveBeenCalledOnce();
    expect(session.close).toHaveBeenCalledOnce();
  });
});

describe('opt-in peer voice', () => {
  beforeEach(async () => {
    window.history.replaceState({}, '', '?collab=1');
    consoleScript = await startRoomcraftDemo();
  });

  it('never requests a microphone on join and follows authoritative local voice state', async () => {
    expect(session.voice.enable).not.toHaveBeenCalled();
    expect(navigator.mediaDevices.getUserMedia).not.toHaveBeenCalled();
    session.transport.remotePeerIds.add('bob');
    await consoleScript.collaboration.toggleVoice();
    expect(session.voice.enable).toHaveBeenCalledWith(
      session.transport.remotePeerIds
    );
    expect(element('collabVoice').textContent).toBe('Mute my mic');
    expect(element('collabVoice').getAttribute('aria-pressed')).toBe('true');
    expect(element('collabVoiceStatus').textContent).toContain('not Gemini');
    session.setVoice(false);
    expect(element('collabVoice').textContent).toBe('Unmute my mic');
    await consoleScript.collaboration.toggleVoice();
    await consoleScript.collaboration.toggleVoice();
    expect(session.voice.isEnabled()).toBe(true);
    expect(session.voice.isMuted()).toBe(true);
    expect(session.voice.setMuted).toHaveBeenCalledWith(true);
    expect(session.voice.disable).not.toHaveBeenCalled();
    expect(element('collabVoiceStatus').textContent).toContain(
      'incoming audio stays connected'
    );
    const captures = session.voice.enable.mock.calls.length;
    await consoleScript.collaboration.toggleVoice();
    expect(session.voice.isMuted()).toBe(false);
    expect(session.voice.enable).toHaveBeenCalledTimes(captures);
    expect(consoleScript.voice.state).toBe('idle');
  });

  it('does not optimistically report enabled after a canceled or unsuccessful enable', async () => {
    session.voice.enable.mockResolvedValueOnce(undefined);
    await consoleScript.collaboration.toggleVoice();
    expect(element('collabVoice').getAttribute('aria-pressed')).toBe('false');
    session.voice.enable.mockRejectedValueOnce(new Error('Permission denied'));
    await consoleScript.collaboration.toggleVoice();
    expect(element('collabVoiceStatus').textContent).toContain(
      'Permission denied'
    );
    expect(element('collabVoiceStatus').dataset.state).toBe('error');
    expect(element('collabVoice').getAttribute('aria-pressed')).toBe('false');
    expect(consoleScript.errorMessage).toBe('');
    expect(element('collabStatus').dataset.state).toBe('ready');
    await consoleScript.collaboration.toggleVoice();
    expect(element('collabVoice').getAttribute('aria-pressed')).toBe('true');
  });

  it('updates remote mic indicators and keeps capture off after a muted reconnect', async () => {
    session.users.set('bob', {
      peerId: 'bob',
      displayName: 'Bob',
      avatar: {voiceActive: true},
    });
    session.dispatchEvent(
      new CustomEvent('peer-voice-state', {detail: {peerId: 'bob', on: true}})
    );
    expect(element('collabPeers').textContent).toContain('Mic on');
    await consoleScript.collaboration.toggleVoice();
    await consoleScript.collaboration.toggleVoice();
    expect(session.voice.isMuted()).toBe(true);
    const old = session;
    session = new Session();
    await consoleScript.collaboration.reconnect();
    expect(old.voice.disable).toHaveBeenCalled();
    expect(session.voice.enable).not.toHaveBeenCalled();
    expect(session.voice.isEnabled()).toBe(false);
    session.users.set('charlie', {peerId: 'charlie', displayName: 'Charlie'});
    session.dispatchEvent(new Event('user-join'));
    expect(session.voice.enable).not.toHaveBeenCalled();
  });

  it.each(['insecure', 'unsupported'])(
    'explains %s capture without requesting permission',
    async (reason) => {
      if (reason === 'insecure') vi.stubGlobal('isSecureContext', false);
      else
        Object.defineProperty(navigator, 'mediaDevices', {
          configurable: true,
          value: undefined,
        });
      await consoleScript.collaboration.toggleVoice();
      expect(session.voice.enable).not.toHaveBeenCalled();
      expect((element('collabVoice') as HTMLButtonElement).disabled).toBe(true);
      expect(element('collabVoiceStatus').textContent).toContain(
        reason === 'insecure' ? 'HTTPS' : 'unavailable'
      );
    }
  );

  it.each(['cancel', 'deny'])(
    'preserves an established listening connection when a mic request is %s',
    async (outcome) => {
      const {VoiceChat} = await import('../netblocks/src/core/voice/VoiceChat');
      const peers: ListeningPeer[] = [];
      class ListeningPeer extends EventTarget {
        close = vi.fn();
        addTransceiver = vi.fn();
        getSenders = () => [];
        setRemoteDescription = vi.fn(async () => {});
        createAnswer = vi.fn(async () => ({type: 'answer', sdp: 'answer'}));
        setLocalDescription = vi.fn(async () => {});
        constructor() {
          super();
          peers.push(this);
        }
      }
      vi.stubGlobal('RTCPeerConnection', ListeningPeer);
      const sent = vi.fn();
      const removed = vi.fn();
      const voice = new VoiceChat(sent);
      voice.setLocalPeerId('listener');
      voice.onTrackRemoved(removed);
      Object.assign(session, {voice});
      await voice.handleSignal('speaker', {
        type: 'voice',
        signal: {kind: 'offer', sdp: 'offer'},
      });
      sent.mockClear();
      const pending = deferred();
      const stopped = vi.fn();
      vi.mocked(navigator.mediaDevices.getUserMedia).mockImplementationOnce(
        async () => {
          if (outcome === 'deny') throw new Error('Permission denied');
          await pending.promise;
          return {getTracks: () => [{stop: stopped}]} as unknown as MediaStream;
        }
      );
      const enabling = consoleScript.collaboration.toggleVoice();
      await Promise.resolve();
      if (outcome === 'cancel') {
        await consoleScript.collaboration.toggleVoice();
        pending.resolve();
      }
      await enabling;
      expect(peers[0].close).not.toHaveBeenCalled();
      expect(removed).not.toHaveBeenCalled();
      expect(
        sent.mock.calls.some(([message]) => message.signal.kind === 'bye')
      ).toBe(false);
      expect(voice.isEnabled()).toBe(false);
      if (outcome === 'cancel') expect(stopped).toHaveBeenCalledOnce();
      else
        expect(
          consoleScript.collaboration.getState().microphone.error
        ).toContain('Permission denied');
    }
  );

  it('does not leave mic acquisition pending on a separate playback resume', async () => {
    const pending = deferred();
    mocks.resumePlayback.mockReturnValueOnce(pending.promise);
    await consoleScript.collaboration.toggleVoice();
    expect(session.voice.enable).toHaveBeenCalledOnce();
    expect(consoleScript.collaboration.getState().microphone.pending).toBe(
      false
    );
    await consoleScript.collaboration.toggleVoice();
    expect(session.voice.isMuted()).toBe(true);
    expect(session.voice.cancelPendingEnable).not.toHaveBeenCalled();
    pending.resolve();
    expect(session.voice.disable).not.toHaveBeenCalled();
  });

  it('can cancel a pending permission request and ignores its late rejection', async () => {
    const pending = deferred();
    session.voice.enable.mockImplementationOnce(async () => {
      await pending.promise;
      throw new Error('Late denial');
    });
    const enabling = consoleScript.collaboration.toggleVoice();
    await Promise.resolve();
    expect(element('collabVoice').textContent).toBe('Cancel mic request');
    expect(element('collabVoice').getAttribute('aria-pressed')).toBe('false');
    await consoleScript.collaboration.toggleVoice();
    expect(session.voice.cancelPendingEnable).toHaveBeenCalledOnce();
    expect(session.voice.disable).not.toHaveBeenCalled();
    expect(element('collabVoice').textContent).toBe('Unmute my mic');
    pending.resolve();
    await enabling;
    expect(element('collabVoiceStatus').textContent).not.toContain('denial');
  });

  it('stops a late real VoiceChat microphone grant after reconnect', async () => {
    const {VoiceChat} = await import('../netblocks/src/core/voice/VoiceChat');
    const old = session;
    const voice = new VoiceChat(() => {}, {
      onLocalStateChange: (on) =>
        old.dispatchEvent(new CustomEvent('local-voice-state', {detail: {on}})),
    });
    Object.assign(old, {voice});
    const pending = deferred();
    const track = {stop: vi.fn()};
    vi.mocked(navigator.mediaDevices.getUserMedia).mockImplementationOnce(
      async () => {
        await pending.promise;
        return {getTracks: () => [track]} as unknown as MediaStream;
      }
    );
    const enabling = consoleScript.collaboration.toggleVoice();
    await Promise.resolve();
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledOnce();
    session = new Session();
    await consoleScript.collaboration.reconnect();
    pending.resolve();
    await enabling;
    expect(track.stop).toHaveBeenCalledOnce();
    expect(voice.isEnabled()).toBe(false);
    expect(session.voice.enable).not.toHaveBeenCalled();
    expect(element('collabVoice').getAttribute('aria-pressed')).toBe('false');
  });

  it.each(['reconnect', 'leave', 'dispose'])(
    'invalidates pending capture on %s without mutating the next session',
    async (action) => {
      const old = session;
      const pending = deferred();
      old.voice.enable.mockImplementationOnce(async () => {
        await pending.promise;
        throw new Error('Stale capture failure');
      });
      const enabling = consoleScript.collaboration.toggleVoice();
      session = new Session();
      await consoleScript.collaboration[action]();
      expect(old.voice.disable).toHaveBeenCalled();
      pending.resolve();
      await enabling;
      expect(session.voice.enable).not.toHaveBeenCalled();
      expect(session.voice.disable).not.toHaveBeenCalled();
      expect(element('collabVoiceStatus').textContent).not.toContain('Stale');
      expect(element('collabVoice').getAttribute('aria-pressed')).toBe('false');
      old.setVoice(true);
      expect(element('collabVoice').getAttribute('aria-pressed')).toBe('false');
    }
  );
});

describe('collaboration startup failures', () => {
  it('shows an editable picker for a bad transport link without opening a session', async () => {
    window.history.replaceState(
      {},
      '',
      '?collab=1&transport=websocket&relay=https://relay.example'
    );
    consoleScript = await startRoomcraftDemo();
    expect(net.joinRoom).not.toHaveBeenCalled();
    expect(element('collaboration').hidden).toBe(false);
    expect(element('collabStatus').textContent).toContain('ws://');
    expect(element('collabRelayField').hidden).toBe(false);
    expect(element('collabLink').hasAttribute('href')).toBe(false);
    await consoleScript.collaboration.retry();
    expect(net.joinRoom).not.toHaveBeenCalled();
    setField('collabRelay', 'wss://relay.example/roomcraft');
    await consoleScript.collaboration.reconnect();
    expect(net.joinRoom).toHaveBeenCalledOnce();
    expect(element('collabStatus').dataset.state).toBe('ready');
  });

  it('switches during an in-flight join and closes only the captured stale session', async () => {
    const joined = deferred();
    const old = session;
    net.joinRoom.mockImplementationOnce(async (_roomId, options) => {
      net.session = old;
      old.transport = options.transport;
      await joined.promise;
      old.isOpen = true;
      // The real NetCore returns its mutable current session after await.
      return net.session;
    });
    window.history.replaceState({}, '', '?collab=1');
    const starting = startRoomcraftDemo();
    await vi.waitFor(() => expect(net.joinRoom).toHaveBeenCalledOnce());
    consoleScript = mocks.add.mock.calls
      .flat()
      .find((object) => object instanceof RoomcraftConsole);
    const room = consoleScript.room;
    const layout = room.layout;
    old.transport.dispatchEvent(
      new CustomEvent('error', {
        detail: {error: new Error('Connection still pending')},
      })
    );
    expect(element('collabStatus').textContent).toContain(
      'Connection still pending'
    );
    session = new Session();
    setField('collabTransport', 'webrtc');
    await consoleScript.collaboration.reconnect();
    expect(element('collabStatus').dataset.state).toBe('ready');
    const currentBridge = bridge();
    joined.resolve();
    await starting;
    expect(old.isOpen).toBe(false);
    expect(session.close).not.toHaveBeenCalled();
    expect(currentBridge.dispose).not.toHaveBeenCalled();
    expect(consoleScript.room).toBe(room);
    expect(room.layout).toBe(layout);
    expect(consoleScript.collaboration.session).toBe(session);
    expect(element('collabStatus').textContent).toContain('WebRTC');
  });

  it('ignores a superseded bridge initialization and stale connection errors', async () => {
    const initialized = deferred();
    mocks.bridgeInit.mockReturnValueOnce(initialized.promise);
    window.history.replaceState({}, '', '?collab=1');
    const starting = startRoomcraftDemo();
    await vi.waitFor(() => expect(mocks.initScript).toHaveBeenCalledOnce());
    consoleScript = mocks.add.mock.calls
      .flat()
      .find((object) => object instanceof RoomcraftConsole);
    const oldBridge = bridge();
    const oldTransport = session.transport;
    const layout = consoleScript.room.layout;
    session = new Session();
    await consoleScript.collaboration.reconnect();
    oldTransport.dispatchEvent(
      new CustomEvent('error', {detail: {error: new Error('Stale connection')}})
    );
    initialized.resolve();
    await starting;
    expect(oldBridge.dispose).toHaveBeenCalledOnce();
    expect(session.close).not.toHaveBeenCalled();
    expect(consoleScript.room.layout).toBe(layout);
    expect(element('collabStatus').dataset.state).toBe('ready');
    expect(consoleScript.errorMessage).not.toContain('Stale');
  });

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
