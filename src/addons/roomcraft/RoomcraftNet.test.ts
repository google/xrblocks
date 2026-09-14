import * as THREE from 'three';
import {afterEach, describe, expect, it, vi} from 'vitest';
import type {Interaction, ManipulationEvent} from 'xrblocks';
import {
  decodeMessage,
  encodeMessage,
  NetObject,
  NetSession,
  Transport,
  type NetMessage,
} from '../netblocks/src/index';
import {Roomcraft} from './Roomcraft';
import {createDefaultCatalog} from './Catalog';
import {RoomcraftNet} from './RoomcraftNet';
import {record} from './RoomcraftNetProtocol';
import type {
  RoomcraftOptions,
  SceneCatalogObject,
  SceneLayout,
} from './SceneTypes';

const clockSources = vi.hoisted(() => new Map<string, () => number>());

vi.mock('./RoomcraftClock', async (importOriginal) => {
  const actual = await importOriginal<typeof import('./RoomcraftClock')>();
  return {
    ...actual,
    RoomcraftClock: class extends actual.RoomcraftClock {
      constructor(
        ...args: ConstructorParameters<typeof actual.RoomcraftClock>
      ) {
        const [session, options] = args;
        super(session, {
          ...options,
          now: clockSources.get(session.localPeerId) ?? options.now,
        });
      }
    },
  };
});

vi.mock('xrblocks', async () => {
  const T = await import('three');
  class FakeUI extends T.Object3D {
    text = '';
    dispose() {}
  }
  return {
    ...(await import('../../core/Script')),
    ...(await import('../../ai/AI')),
    ...(await import('../../world/World')),
    ...(await import('../../utils/ThreeDisposal')),
    ...(await import('../../utils/ObjectPlacement')),
    ...(await import('../../utils/ModelLoader')),
    Interaction: class {},
    StylizedFace: FakeUI,
    UICard: FakeUI,
    UIText: FakeUI,
    core: undefined,
  };
});

class Bus {
  peers = new Map<string, TestTransport>();
  messages: Array<() => void> = [];
  sent: Array<{from: string; message: NetMessage}> = [];
  receive(_id: string, deliver: () => void) {
    deliver();
  }
  flush() {
    while (this.messages.length) this.messages.shift()!();
  }
  async settle() {
    for (let i = 0; i < 30; i++) {
      this.flush();
      await Promise.resolve();
    }
  }
}

class TestTransport extends Transport {
  readonly name = 'test';
  isOpen = false;
  readonly remotePeerIds = new Set<string>();
  constructor(
    readonly bus: Bus,
    readonly localPeerId: string
  ) {
    super();
  }
  async connect() {
    this.isOpen = true;
    for (const [id, peer] of this.bus.peers) {
      this.remotePeerIds.add(id);
      peer.remotePeerIds.add(this.localPeerId);
    }
    this.bus.peers.set(this.localPeerId, this);
  }
  close() {
    this.isOpen = false;
    this.bus.peers.delete(this.localPeerId);
  }
  send(bytes: Uint8Array, target?: string) {
    this.bus.sent.push({from: this.localPeerId, message: decodeMessage(bytes)});
    for (const [id, peer] of this.bus.peers) {
      if (id === this.localPeerId || (target && target !== id)) continue;
      this.bus.messages.push(() => {
        if (peer.isOpen)
          this.bus.receive(id, () => peer.emitMessage(this.localPeerId, bytes));
      });
    }
  }
}

function chair(id = 'chair'): SceneCatalogObject {
  return {
    id,
    name: 'Reading chair',
    asset: 'box',
    color: '#aa7755',
    position: [0, 0, 0],
    rotation: 0,
    scale: [1, 1, 1],
  };
}

const rooms: Roomcraft[] = [];
const bridges: RoomcraftNet[] = [];
const sessions: NetSession[] = [];

async function peer(
  bus: Bus,
  id: string,
  seed: SceneLayout = {title: 'Room', objects: [chair()]},
  beforeBridge?: () => Promise<void>,
  options: RoomcraftOptions = {}
) {
  const planner = vi.fn(async () => ({title: 'Room', edits: []}));
  const room = new Roomcraft({...options, planner});
  rooms.push(room);
  await room.applyLayout(seed);
  room.position.z = -2.4;
  const session = new NetSession(
    new TestTransport(bus, id),
    new THREE.Group(),
    {displayName: id}
  );
  sessions.push(session);
  await session.open('room');
  await beforeBridge?.();
  const collaboration = new RoomcraftNet(room, session);
  bridges.push(collaboration);
  const interaction: Pick<Interaction, 'cancelObject'> = {
    cancelObject: vi.fn(),
  };
  await collaboration.init({interaction});
  return {room, session, collaboration, planner, interaction};
}

function binding(p: Awaited<ReturnType<typeof peer>>, id = 'chair') {
  const result = p.session.netObjects.get(`roomcraft:object:${id}`);
  if (!result) throw new Error(`Missing binding ${id}`);
  return result;
}

function manipulate(room: Roomcraft, phase: ManipulationEvent['phase']) {
  const owner = room.getObject('chair')!;
  room.onObjectManipulate({
    phase,
    action: 'translate',
    source: {
      type: 'mouse',
      handedness: 'none',
      controller: new THREE.Object3D(),
    },
    sources: [],
    owner,
    target: owner,
    surface: owner.children[0],
    currentTarget: room,
    defaultPrevented: false,
    preventDefault: vi.fn(),
    stopPropagation: vi.fn(),
    point: new THREE.Vector3(),
    delta: new THREE.Vector3(),
    position: owner.position.clone(),
    worldPosition: owner.position.clone(),
  });
}

function layouts(bus: Bus) {
  return bus.sent.filter(
    ({message}) =>
      message.type === 'rpc' && message.topic === 'roomcraft:layout'
  );
}

afterEach(() => {
  bridges.splice(0).forEach((bridge) => bridge.dispose());
  sessions.splice(0).forEach((session) => session.close());
  rooms.splice(0).forEach((room) => room.dispose());
  clockSources.clear();
  vi.restoreAllMocks();
});

describe('RoomcraftNet', () => {
  it('isolates only delegated bindings from generic catch-up, not other NetObjects', async () => {
    const bus = new Bus();
    const a = await peer(bus, 'a');
    await a.room.applyPlan({title: 'Dirty bindings', edits: []});
    const unrelated = new NetObject({id: 'unrelated'});
    unrelated.snapToXform([2, 0, 0, 0, 0, 0, 1, 1, 1, 1]);
    a.session.netObjects.add(unrelated);
    const session = new NetSession(
      new TestTransport(bus, 'b'),
      new THREE.Group()
    );
    sessions.push(session);
    const delegated = new NetObject({
      id: 'roomcraft:object:chair',
      automaticSnapshots: false,
    });
    const ordinary = new NetObject({id: 'unrelated'});
    session.netObjects.add(delegated);
    session.netObjects.add(ordinary);
    await session.open('room');
    await bus.settle();
    const snapshots = bus.sent.flatMap(({from, message}) =>
      from === 'a' && message.type === 'netobject.snapshot'
        ? [message.objects]
        : []
    );
    expect(snapshots.flat().map((object) => object.id)).toEqual(['unrelated']);
    expect(ordinary.position.x).toBe(2);
    a.session.transport.send(
      encodeMessage({
        type: 'netobject.snapshot',
        objects: [
          {
            id: delegated.netId,
            ownerId: '',
            xform: [9, 0, 0, 0, 0, 0, 1, 1, 1, 1],
          },
          {
            id: ordinary.netId,
            ownerId: '',
            xform: [4, 0, 0, 0, 0, 0, 1, 1, 1, 1],
          },
        ],
      }),
      'b'
    );
    await bus.settle();
    expect(delegated.position.x).toBe(0);
    expect(ordinary.position.x).toBe(4);
  });

  it('keeps a newer offline placement when generic backend catch-up arrives after the bridge', async () => {
    const bus = new Bus();
    const a = await peer(bus, 'a');
    const b = await peer(bus, 'b');
    await bus.settle();
    await a.room.applyPlan({title: 'Established', edits: []});
    await bus.settle();
    await b.room.applyPlan({title: 'Survivor edit', edits: []});
    await bus.settle();
    a.collaboration.dispose();
    a.session.close();
    await bus.settle();
    a.room.getObject('chair')!.position.x = 3;
    const session = new NetSession(
      new TestTransport(bus, 'a2'),
      new THREE.Group()
    );
    sessions.push(session);
    await session.open('room');
    const bridge = new RoomcraftNet(a.room, session);
    bridges.push(bridge);
    await bridge.init({interaction: a.interaction});
    await bus.settle();
    expect(a.room.getObject('chair')!.position.x).toBe(3);
    expect(b.room.getObject('chair')!.position.x).toBe(3);
    expect(b.room.layout).toEqual(a.room.layout);
    expect(bridge.status).toBe('ready');
    expect(b.collaboration.status).toBe('ready');
  });

  it('carries released claim generations before publishing offline placements on reconnect', async () => {
    const bus = new Bus();
    const a = await peer(bus, 'a');
    const b = await peer(bus, 'b');
    await bus.settle();
    manipulate(a.room, 'start');
    await bus.settle();
    manipulate(a.room, 'end');
    await bus.settle();
    const claim = {...binding(a).claim!};
    a.collaboration.dispose();
    a.session.close();
    await bus.settle();
    a.room.getObject('chair')!.position.x = 3;
    const session = new NetSession(
      new TestTransport(bus, 'a2'),
      new THREE.Group()
    );
    sessions.push(session);
    await session.open('room');
    // Consume hello catch-up before bindings exist, isolating ownership history.
    await bus.settle();
    const bridge = new RoomcraftNet(a.room, session);
    bridges.push(bridge);
    await bridge.init({interaction: a.interaction});
    expect(session.netObjects.get('roomcraft:object:chair')!.claim).toEqual(
      claim
    );
    expect(session.netObjects.get('roomcraft:object:chair')!.ownerId).toBe('');
    await bus.settle();
    expect(a.room.getObject('chair')!.position.x).toBe(3);
    expect(b.room.getObject('chair')!.position.x).toBe(3);
    expect(b.collaboration.diagnostics.revision).toEqual(
      bridge.diagnostics.revision
    );
    expect(b.collaboration.status).toBe('ready');
    expect(bridge.status).toBe('ready');
  });

  it.each([false, true])(
    'accepts newer scene placement without downgrading the surviving released claim generation (busy=%s)',
    async (busy) => {
      const bus = new Bus();
      const returning = await peer(bus, 'z');
      let delayed = false;
      let failLoad!: (error: Error) => void;
      const gate = new Promise<void>((_, reject) => {
        failLoad = reject;
      });
      const catalog = createDefaultCatalog().map((asset) => ({
        ...asset,
        create: async (color: string) => {
          if (delayed && asset.id === 'box') await gate;
          return asset.create(color);
        },
      }));
      const survivor = await peer(bus, 'a', undefined, undefined, {catalog});
      await bus.settle();
      manipulate(returning.room, 'start');
      await bus.settle();
      manipulate(returning.room, 'end');
      await bus.settle();
      returning.collaboration.dispose();
      returning.session.close();
      await bus.settle();
      manipulate(survivor.room, 'start');
      survivor.room.getObject('chair')!.position.x = 1;
      manipulate(survivor.room, 'end');
      await bus.settle();
      expect(binding(survivor).claim?.counter).toBe(2);
      let failedLoad: Promise<void> | undefined;
      if (busy) {
        delayed = true;
        failedLoad = expect(
          survivor.room.applyPlan({
            title: 'Pending local change',
            edits: [{op: 'update', id: 'chair', changes: {color: '#ffffff'}}],
          })
        ).rejects.toThrow('Local load failed');
        expect(survivor.room.busy).toBe(true);
      }
      returning.room.getObject('chair')!.position.x = 3;
      const session = new NetSession(
        new TestTransport(bus, 'z2'),
        new THREE.Group()
      );
      sessions.push(session);
      await session.open('room');
      const bridge = new RoomcraftNet(returning.room, session);
      bridges.push(bridge);
      await bridge.init({interaction: returning.interaction});
      await bus.settle();
      if (busy) {
        expect(
          survivor.collaboration.diagnostics.queuedLayouts
        ).toBeGreaterThan(0);
        delayed = false;
        failLoad(new Error('Local load failed'));
        await failedLoad;
        await bus.settle();
      }
      expect(returning.room.getObject('chair')!.position.x).toBe(3);
      expect(survivor.room.getObject('chair')!.position.x).toBe(3);
      expect(binding(survivor).claim).toEqual({counter: 2, peerId: 'a'});
      const returningBinding = session.netObjects.get(
        'roomcraft:object:chair'
      )!;
      expect(returningBinding.claim).toEqual({counter: 2, peerId: 'a'});
      expect(bridge.diagnostics.revision).toEqual(
        survivor.collaboration.diagnostics.revision
      );
      expect(bridge.status).toBe('ready');
      expect(survivor.collaboration.status).toBe('ready');

      manipulate(returning.room, 'start');
      await bus.settle();
      expect(returningBinding.claim?.counter).toBe(3);
      expect(binding(survivor).ownerId).toBe('z2');
      returning.room.getObject('chair')!.position.x = 4;
      session.update(1);
      await bus.settle();
      binding(survivor).stepInterpolation(1);
      expect(survivor.room.getObject('chair')!.position.x).toBe(4);
      manipulate(returning.room, 'end');
    }
  );

  it.each([false, true])(
    'retains an authoritative final release when catch-up crosses delayed owner traffic (delay claim=%s)',
    async (delayClaim) => {
      const bus = new Bus();
      const a = await peer(bus, 'a');
      const b = await peer(bus, 'b');
      const c = await peer(bus, 'c');
      await bus.settle();
      await a.room.applyPlan({title: 'Shared', edits: []});
      await bus.settle();
      const delayed: Array<() => void> = [];
      let hold = delayClaim;
      bus.receive = (id, deliver) => {
        if (hold && id === 'b') delayed.push(deliver);
        else deliver();
      };
      manipulate(a.room, 'start');
      await bus.settle();
      hold = true;
      a.room.getObject('chair')!.position.x = 3;
      a.collaboration.dispose();
      await bus.settle();
      binding(c).stepInterpolation(1);
      expect(c.room.getObject('chair')!.position.x).toBe(3);
      hold = false;
      c.collaboration.resync();
      await bus.settle();
      expect(c.room.getObject('chair')!.position.x).toBe(3);
      for (const deliver of delayed) deliver();
      await bus.settle();
      binding(b).stepInterpolation(1);
      binding(c).stepInterpolation(1);
      expect(b.room.getObject('chair')!.position.x).toBe(3);
      expect(c.room.getObject('chair')!.position.x).toBe(3);
      expect(b.collaboration.diagnostics.revision).toEqual(
        c.collaboration.diagnostics.revision
      );
    }
  );

  it('answers only the latest snapshot request after staged content and revision commit together', async () => {
    const bus = new Bus();
    const a = await peer(bus, 'a');
    let delayed = false;
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const catalog = createDefaultCatalog().map((asset) => ({
      ...asset,
      create: async (color: string) => {
        if (delayed && asset.id === 'box') await gate;
        return asset.create(color);
      },
    }));
    const b = await peer(bus, 'b', undefined, undefined, {catalog});
    await bus.settle();
    manipulate(a.room, 'start');
    await bus.settle();
    manipulate(a.room, 'end');
    await bus.settle();
    delayed = true;
    await a.room.applyPlan({
      title: 'New placement',
      edits: [
        {
          op: 'update',
          id: 'chair',
          changes: {position: [3, 0, 0], color: '#ffffff'},
        },
      ],
    });
    await bus.settle();
    expect(b.room.busy).toBe(true);
    bus.sent.length = 0;
    a.session.events.emitTo('b', 'roomcraft:sync-request', {id: 'first'});
    a.session.events.emitTo('b', 'roomcraft:sync-request', {id: 'latest'});
    await bus.settle();
    const replies = () =>
      bus.sent.flatMap(({from, message}) =>
        from === 'b' &&
        message.type === 'rpc' &&
        message.topic === 'roomcraft:sync-state'
          ? [record(message.payload)]
          : []
      );
    expect(replies()).toHaveLength(0);
    finish();
    await bus.settle();
    expect(b.room.getObject('chair')!.position.x).toBe(3);
    expect(a.room.layout).toEqual(b.room.layout);
    expect(b.collaboration.status).toBe('ready');
    expect(replies()).toHaveLength(1);
    expect(replies()[0]).toMatchObject({
      id: 'latest',
      snapshot: {
        revision: b.collaboration.diagnostics.revision,
        layout: b.room.layout,
      },
    });
  });

  it('does not publish a joiner default scene while transport discovery is delayed', async () => {
    const bus = new Bus();
    const host = await peer(bus, 'a', {
      title: 'Saved cat scene',
      objects: [chair('cat')],
    });
    await vi.waitFor(() => expect(host.collaboration.status).toBe('ready'));
    const joiner = new Roomcraft();
    rooms.push(joiner);
    await joiner.applyLayout({title: 'Empty joiner', objects: []});
    const transport = new TestTransport(bus, 'z');
    const session = new NetSession(transport, new THREE.Group());
    sessions.push(session);
    await session.open('room');
    // WebRTC signaling can open before any data channels or peer hello messages arrive.
    transport.remotePeerIds.clear();
    const bridge = new RoomcraftNet(joiner, session, {seedLocalScene: false});
    bridges.push(bridge);
    await bridge.init({interaction: host.interaction});
    await new Promise((resolve) => setTimeout(resolve, 350));
    expect.soft(bridge.diagnostics.revision.counter).toBe(0);
    await bus.settle();
    expect(host.room.layout.title).toBe('Saved cat scene');
    expect(joiner.getObject('cat')).toBeDefined();
    expect(joiner.layout).toEqual(host.room.layout);
    expect(bridge.status).toBe('ready');
  });

  it('keeps an unanswered Join passive after its snapshot timeout', async () => {
    const bus = new Bus();
    const local = await peer(bus, 'a');
    local.collaboration.dispose();
    const blank = new Roomcraft();
    rooms.push(blank);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']});
    try {
      const bridge = new RoomcraftNet(blank, local.session, {
        seedLocalScene: false,
      });
      bridges.push(bridge);
      await bridge.init({interaction: local.interaction});
      await vi.advanceTimersByTimeAsync(8400);
      expect(bridge.status).toBe('error');
      expect(bridge.diagnostics.revision.counter).toBe(0);
      expect(bridge.diagnostics.seedLocalScene).toBe(false);
      bridge.resync();
      expect(bridge.status).toBe('syncing');
      expect(bridge.diagnostics.revision.counter).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not let two passive joiners seed each other before the creator becomes reachable', async () => {
    const bus = new Bus();
    const host = await peer(bus, 'a', {
      title: 'Saved cat scene',
      objects: [chair('cat')],
    });
    await vi.waitFor(() => expect(host.collaboration.status).toBe('ready'));
    const delayed: Array<() => void> = [];
    let holdHost = true;
    bus.receive = (id, deliver) => {
      if (holdHost && id === 'a') delayed.push(deliver);
      else deliver();
    };
    const joiners = [];
    for (const id of ['y', 'z']) {
      const room = new Roomcraft();
      rooms.push(room);
      const session = new NetSession(
        new TestTransport(bus, id),
        new THREE.Group()
      );
      sessions.push(session);
      await session.open('room');
      const bridge = new RoomcraftNet(room, session, {seedLocalScene: false});
      bridges.push(bridge);
      await bridge.init({interaction: host.interaction});
      joiners.push({room, bridge});
    }
    await bus.settle();
    for (const {bridge} of joiners)
      expect.soft(bridge.diagnostics.revision.counter).toBe(0);
    holdHost = false;
    for (const deliver of delayed) deliver();
    await bus.settle();
    expect(host.room.layout.title).toBe('Saved cat scene');
    for (const {room, bridge} of joiners) {
      expect(room.getObject('cat')).toBeDefined();
      expect(bridge.status).toBe('ready');
    }
  });

  it('lets an explicit creator seed a scene when passive joiners already exist', async () => {
    const bus = new Bus();
    const waitingRoom = new Roomcraft();
    rooms.push(waitingRoom);
    const waitingSession = new NetSession(
      new TestTransport(bus, 'z'),
      new THREE.Group()
    );
    sessions.push(waitingSession);
    await waitingSession.open('room');
    const interaction = {cancelObject: vi.fn()};
    const waiting = new RoomcraftNet(waitingRoom, waitingSession, {
      seedLocalScene: false,
    });
    bridges.push(waiting);
    await waiting.init({interaction});
    const creatorRoom = new Roomcraft();
    rooms.push(creatorRoom);
    await creatorRoom.applyLayout({
      title: 'Creator scene',
      objects: [chair('cat')],
    });
    const creatorSession = new NetSession(
      new TestTransport(bus, 'a'),
      new THREE.Group()
    );
    sessions.push(creatorSession);
    await creatorSession.open('room');
    const creator = new RoomcraftNet(creatorRoom, creatorSession, {
      seedLocalScene: true,
    });
    bridges.push(creator);
    await creator.init({interaction});
    await bus.settle();
    expect(creatorRoom.getObject('cat')).toBeDefined();
    expect(waitingRoom.layout).toEqual(creatorRoom.layout);
    expect(waiting.status).toBe('ready');
  });

  it('exposes detached payload-free diagnostics for scene requests and revision changes', async () => {
    const bus = new Bus();
    const a = await peer(bus, 'a');
    const b = await peer(bus, 'b');
    await bus.settle();
    const changed = vi.fn();
    b.collaboration.addEventListener('diagnosticschange', changed);
    await a.room.applyPlan({title: 'Private authored scene', edits: []});
    await bus.settle();
    const state = b.collaboration.diagnostics;
    expect(state.status).toBe('ready');
    expect(state.revision).toEqual(a.collaboration.diagnostics.revision);
    expect(state.messages.received).toBeGreaterThan(0);
    expect(state.waitingForSnapshot).toBe(false);
    expect(state.applyingLayout).toBe(false);
    expect(changed).toHaveBeenCalled();
    expect(JSON.stringify(state)).not.toContain('Private authored scene');
    state.revision.counter = 1000;
    state.messages.received = 1000;
    expect(b.collaboration.diagnostics.revision.counter).not.toBe(1000);
    expect(b.collaboration.diagnostics.messages.received).not.toBe(1000);
    b.collaboration.dispose();
    expect(b.collaboration.diagnostics.status).toBe('closed');
    const afterDispose = changed.mock.calls.length;
    await a.room.applyPlan({title: 'Later scene', edits: []});
    await bus.settle();
    expect(changed).toHaveBeenCalledTimes(afterDispose);
  });

  it('keeps the existing clock authority when replacing a lower-ID follower bridge', async () => {
    const bus = new Bus();
    const leader = await peer(bus, 'z');
    await leader.room.applyPlan({title: 'Established scene', edits: []});
    const follower = await peer(bus, 'a');
    await bus.settle();
    expect(follower.collaboration.motionClockState?.authority).toBe('z');
    follower.collaboration.dispose();
    const replacement = new RoomcraftNet(follower.room, follower.session);
    bridges.push(replacement);
    await replacement.init({interaction: follower.interaction});
    await bus.settle();
    expect(replacement.motionClockState?.authority).toBe('z');
    expect(leader.collaboration.motionClockState?.authority).toBe('z');
    expect(replacement.motionClockState?.synchronized).toBe(true);
  });

  it('preserves authored revision lineage and offline edits when switching sessions', async () => {
    const original = await peer(new Bus(), 'original');
    await original.room.applyPlan({title: 'Authored scene', edits: []});
    original.collaboration.dispose();
    original.session.close();
    await original.room.applyPlan({
      title: 'Edited while disconnected',
      edits: [{op: 'add', object: chair('offline-chair')}],
    });
    const bus = new Bus();
    const other = await peer(bus, 'other');
    await vi.waitFor(() => expect(other.collaboration.status).toBe('ready'));
    const session = new NetSession(
      new TestTransport(bus, 'reconnected'),
      new THREE.Group()
    );
    sessions.push(session);
    await session.open('room');
    const bridge = new RoomcraftNet(original.room, session);
    bridges.push(bridge);
    await bridge.init({interaction: original.interaction});
    await bus.settle();
    expect(original.room.layout.title).toBe('Edited while disconnected');
    expect(other.room.layout).toEqual(original.room.layout);
    expect(other.room.getObject('offline-chair')).toBeDefined();
  });

  it('scopes continuation to the room being joined, while retaining same-room offline edits', async () => {
    const original = await peer(new Bus(), 'a');
    original.collaboration.dispose();
    const first = new RoomcraftNet(original.room, original.session, {
      roomId: 'first',
    });
    bridges.push(first);
    await first.init({interaction: original.interaction});
    for (let i = 0; i < 4; i++)
      await original.room.applyPlan({title: `First room edit ${i}`, edits: []});
    first.dispose();
    original.session.close();
    const bus = new Bus();
    const existing = await peer(bus, 'b');
    await existing.room.applyPlan({
      title: 'Established second room',
      edits: [],
    });
    const rejoin = async (id: string) => {
      const session = new NetSession(
        new TestTransport(bus, id),
        new THREE.Group()
      );
      sessions.push(session);
      await session.open('second');
      const bridge = new RoomcraftNet(original.room, session, {
        roomId: 'second',
      });
      bridges.push(bridge);
      await bridge.init({interaction: original.interaction});
      await bus.settle();
      return {session, bridge};
    };
    const second = await rejoin('a2');
    expect(original.room.layout.title).toBe('Established second room');
    expect(existing.room.layout.title).toBe('Established second room');
    second.bridge.dispose();
    second.session.close();
    await original.room.applyPlan({
      title: 'Second room offline edit',
      edits: [],
    });
    await rejoin('a3');
    expect(original.room.layout.title).toBe('Second room offline edit');
    expect(existing.room.layout).toEqual(original.room.layout);
  });

  it('keeps the surviving clock after an offline-edited authority returns with a newer scene', async () => {
    let elapsedMs = 10_000;
    let active = 'a';
    const authorNow = () => 90_000 + elapsedMs * 1.0002;
    clockSources.set('a', authorNow);
    clockSources.set('a2', authorNow);
    clockSources.set('b', () => 9_000_000 + elapsedMs);
    vi.spyOn(performance, 'now').mockImplementation(() =>
      clockSources.get(active)!()
    );
    const bus = new Bus();
    bus.receive = (id, deliver) => {
      const previous = active;
      active = id;
      try {
        deliver();
      } finally {
        active = previous;
      }
    };
    const a = await peer(bus, 'a', {
      title: 'Moving scene',
      objects: [
        {
          id: 'rotor',
          name: 'Rotor',
          color: '#ffffff',
          position: [0, 0, 0],
          rotation: 0,
          scale: [1, 1, 1],
          parts: [
            {
              id: 'blade',
              name: 'Blade',
              shape: 'box',
              parent: null,
              position: [0, 1, 0],
              rotation: [0, 0, 0],
              size: [1, 0.1, 0.2],
              color: '#336699',
              motion: {kind: 'spin', axis: 'y', pivot: [0, 0, 0], speed: 1},
            },
          ],
        },
      ],
    });
    await a.room.applyPlan({title: 'Established scene', edits: []});
    active = 'b';
    const b = await peer(bus, 'b');
    await bus.settle();
    expect(b.collaboration.motionClockState?.authority).toBe('a');
    active = 'a';
    a.collaboration.dispose();
    a.session.close();
    await bus.settle();
    expect(b.collaboration.motionClockState?.authority).toBe('b');
    elapsedMs += 11_250;
    await a.room.applyPlan({title: 'Offline edits', edits: []});
    active = 'a2';
    const session = new NetSession(
      new TestTransport(bus, 'a2'),
      new THREE.Group()
    );
    sessions.push(session);
    await session.open('room');
    const bridge = new RoomcraftNet(a.room, session);
    bridges.push(bridge);
    await bridge.init({interaction: a.interaction});
    await bus.settle();
    expect(a.room.layout.title).toBe('Offline edits');
    expect(b.room.layout).toEqual(a.room.layout);
    expect(bridge.motionClockState).toMatchObject({
      authority: 'b',
      synchronized: true,
    });
    expect(b.collaboration.motionClockState).toMatchObject({
      authority: 'b',
      synchronized: true,
    });
    expect(a.room.motionTimeSource!()).toBeCloseTo(
      b.room.motionTimeSource!(),
      8
    );
    const before = b.room.motionTimeSource!();
    elapsedMs += 1375;
    bridge.resync();
    await bus.settle();
    a.room.update();
    b.room.update();
    expect(b.room.motionTimeSource!()).toBeCloseTo(before + 1.375, 8);
    expect(a.room.motionTimeSource!()).toBeCloseTo(
      b.room.motionTimeSource!(),
      8
    );
    const rotation = (room: Roomcraft) =>
      room.getObject('rotor')!.getObjectByName('blade')!.quaternion;
    expect(rotation(a.room).angleTo(rotation(b.room))).toBeLessThan(1e-7);
  });

  it('shares absolute motion through late joining, replacement, local pause, and reconnect cleanup', async () => {
    let now = 1000;
    vi.spyOn(performance, 'now').mockImplementation(() => now);
    const bus = new Bus();
    const moving: SceneLayout = {
      title: 'Pendulum',
      objects: [
        {
          id: 'pendulum',
          name: 'Pendulum',
          position: [0, 0, 0],
          rotation: 0,
          scale: [1, 1, 1],
          color: '#ffffff',
          parts: [
            {
              id: 'ball',
              name: 'Ball',
              shape: 'sphere',
              parent: null,
              position: [0, 1, 0],
              rotation: [0, 0, 0],
              size: [0.2, 0.2, 0.2],
              color: '#336699',
              motion: {
                kind: 'swing',
                axis: 'z',
                pivot: [0, 1, 0],
                amplitude: 0.8,
                period: 4,
              },
            },
          ],
        },
      ],
    };
    const a = await peer(bus, 'a', moving);
    await a.room.applyPlan({title: 'Shared pendulum', edits: []});
    now = 3250;
    a.room.update();
    const b = await peer(bus, 'b', {title: 'Joining', objects: []});
    await bus.settle();
    const rotation = (room: Roomcraft) =>
      room.getObject('pendulum')!.getObjectByName('ball')!.quaternion;
    b.room.update();
    expect(rotation(b.room).angleTo(rotation(a.room))).toBeLessThan(1e-7);
    expect(b.collaboration.motionClockState?.synchronized).toBe(true);
    now = 4750;
    await a.room.applyPlan({
      title: 'Shared pendulum',
      edits: [{op: 'update', id: 'pendulum', changes: {color: '#ccaa88'}}],
    });
    await bus.settle();
    a.room.update();
    b.room.update();
    expect(rotation(b.room).angleTo(rotation(a.room))).toBeLessThan(1e-7);
    a.room.setMotionPaused(true);
    const frozen = rotation(a.room).clone();
    now += 1500;
    a.room.update();
    b.room.update();
    expect(rotation(a.room).angleTo(frozen)).toBeLessThan(1e-7);
    expect(b.room.motionPaused).toBe(false);
    expect(rotation(b.room).angleTo(frozen)).toBeGreaterThan(0.1);
    a.room.setMotionPaused(false);
    expect(rotation(a.room).angleTo(rotation(b.room))).toBeLessThan(1e-7);
    const elapsed = b.room.motionTimeSource!();
    b.collaboration.dispose();
    expect(b.room.motionTimeSource).toBeUndefined();
    now += 2000;
    const replacement = new RoomcraftNet(b.room, b.session);
    bridges.push(replacement);
    await replacement.init({interaction: b.interaction});
    expect(b.room.motionTimeSource!()).toBeCloseTo(elapsed + 2, 8);
    await bus.settle();
    a.room.update();
    b.room.update();
    expect(rotation(b.room).angleTo(rotation(a.room))).toBeLessThan(1e-7);
  });

  it('times out a missing transform reply rather than waiting forever', async () => {
    const bus = new Bus();
    const a = await peer(bus, 'a');
    const b = await peer(bus, 'b');
    await bus.settle();
    vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']});
    try {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const emit = a.session.events.emitTo.bind(a.session.events);
      vi.spyOn(a.session.events, 'emitTo').mockImplementation(
        (to, topic, payload) => {
          if (topic !== 'roomcraft:objects-state') emit(to, topic, payload);
        }
      );
      await a.room.applyPlan({title: 'Awaiting transforms', edits: []});
      await bus.settle();
      expect(b.collaboration.pendingCount).toBeGreaterThan(0);
      await vi.advanceTimersByTimeAsync(8001);
      expect(b.collaboration.status).toBe('error');
      expect(b.collaboration.pendingCount).toBe(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not let a late joiner replace an established preloaded scene with its defaults', async () => {
    const bus = new Bus();
    const a = await peer(bus, 'a', {
      title: 'Saved room',
      objects: [chair(), chair('saved-lamp')],
    });
    await vi.waitFor(() => expect(a.collaboration.status).toBe('ready'));
    const b = await peer(bus, 'z', {title: 'Empty defaults', objects: []});
    await bus.settle();
    expect(a.room.layout.title).toBe('Saved room');
    expect(b.room.layout).toEqual(a.room.layout);
    expect(b.collaboration.status).toBe('ready');
  });

  it('recovers when a transport hello arrives before the other bridge subscribes', async () => {
    const bus = new Bus();
    const a = await peer(bus, 'a');
    const b = await peer(bus, 'b', undefined, () => bus.settle());
    await bus.settle();
    expect(a.collaboration.status).toBe('ready');
    expect(b.collaboration.status).toBe('ready');
    expect(a.collaboration.pendingCount).toBe(0);
    expect(b.room.layout).toEqual(a.room.layout);
  });

  it('broadcasts a local change once and applies remotely without AI or echo', async () => {
    const bus = new Bus();
    const a = await peer(bus, 'a');
    const b = await peer(bus, 'b');
    await bus.settle();
    bus.sent.length = 0;
    const apply = vi.spyOn(b.room, 'applyLayout');
    const request = vi.spyOn(b.room, 'request');
    await a.room.applyPlan({
      title: 'Reading room',
      edits: [{op: 'add', object: chair('lamp')}],
    });
    await bus.settle();
    expect(layouts(bus)).toHaveLength(1);
    expect(apply).toHaveBeenCalledTimes(1);
    expect(request).not.toHaveBeenCalled();
    expect(b.planner).not.toHaveBeenCalled();
    expect(b.room.layout).toEqual(a.room.layout);
    expect(a.collaboration.status).toBe('ready');
    expect(b.collaboration.status).toBe('ready');
  });

  it('queues a busy emitter, then applies layouts one at a time in receive order', async () => {
    const bus = new Bus();
    const a = await peer(bus, 'a');
    const b = await peer(bus, 'b');
    await bus.settle();
    const busy = vi.spyOn(b.room, 'busy', 'get').mockReturnValue(true);
    const applied: string[] = [];
    b.room.addEventListener('change', ({layout}) => applied.push(layout.title));
    await a.room.applyPlan({title: 'First', edits: []});
    await a.room.applyPlan({title: 'Second', edits: []});
    await bus.settle();
    expect(b.room.layout.title).toBe('Room');
    expect(b.collaboration.pendingCount).toBe(2);
    busy.mockRestore();
    b.room.dispatchEvent({type: 'statuschange', status: 'ready'});
    await bus.settle();
    expect(applied).toEqual(['First', 'Second']);
    expect(b.collaboration.pendingCount).toBe(0);
  });

  it('converges simultaneous authors and ignores an older queued write after a local commit', async () => {
    const bus = new Bus();
    const a = await peer(bus, 'a');
    const b = await peer(bus, 'b');
    await bus.settle();
    await a.room.applyPlan({title: 'Alice', edits: []});
    await b.room.applyPlan({title: 'Bob', edits: []});
    await bus.settle();
    expect(a.room.layout.title).toBe('Bob');
    expect(b.room.layout).toEqual(a.room.layout);

    const busy = vi.spyOn(a.room, 'busy', 'get').mockReturnValue(true);
    await b.room.applyPlan({title: 'Queued', edits: []});
    await bus.settle();
    busy.mockRestore();
    await a.room.applyPlan({title: 'Newer local', edits: []});
    await bus.settle();
    expect(a.room.layout.title).toBe('Newer local');
    expect(b.room.layout).toEqual(a.room.layout);
  });

  it('keeps bindings across content swaps and reconciles delete/restore without reparenting', async () => {
    const bus = new Bus();
    const a = await peer(bus, 'a');
    const object = a.room.getObject('chair')!;
    const original = binding(a);
    expect(object.parent).toBe(a.room);
    expect(original.ownerId).toBe('');
    expect(original._dirty).toBe(false);
    await a.room.applyPlan({
      title: 'Room',
      edits: [{op: 'update', id: 'chair', changes: {color: '#ffffff'}}],
    });
    expect(binding(a)).toBe(original);
    expect(a.room.getObject('chair')).toBe(object);
    await a.room.applyPlan({
      title: 'Room',
      edits: [{op: 'remove', id: 'chair'}],
    });
    expect(a.session.netObjects.has(original.netId)).toBe(false);
    await a.room.undo();
    expect(binding(a)).not.toBe(original);
    expect(binding(a).object).not.toBe(object);
  });

  it('replicates a bound target during a grab and after release using NetSession', async () => {
    const bus = new Bus();
    const a = await peer(bus, 'a');
    const b = await peer(bus, 'b');
    await bus.settle();
    manipulate(a.room, 'start');
    await bus.settle();
    expect(binding(b).ownerId).toBe('a');
    a.room.getObject('chair')!.position.x = 2;
    a.session.update();
    await bus.settle();
    binding(b).stepInterpolation(0.5);
    expect(b.room.getObject('chair')!.position.x).toBeCloseTo(1);
    manipulate(a.room, 'end');
    await bus.settle();
    expect(binding(b).ownerId).toBe('');
    expect(b.room.getObject('chair')!.position.x).toBe(2);
  });

  it('cancels a losing grab without echoing its cancellation as a scene write', async () => {
    const bus = new Bus();
    const a = await peer(bus, 'a');
    const b = await peer(bus, 'b');
    await bus.settle();
    manipulate(a.room, 'start');
    await bus.settle();
    vi.mocked(a.interaction.cancelObject).mockImplementation(() =>
      manipulate(a.room, 'cancel')
    );
    manipulate(b.room, 'start');
    await bus.settle();
    bus.sent.length = 0;
    a.collaboration.update();
    expect(a.interaction.cancelObject).toHaveBeenCalledWith(
      a.room.getObject('chair'),
      'disabled'
    );
    expect(layouts(bus)).toHaveLength(0);
    expect(binding(a).ownerId).toBe('b');
  });

  it.each([false, true])(
    'resolves crossed grabs to one held owner and its pose (reverse=%s)',
    async (reverse) => {
      const bus = new Bus();
      const a = await peer(bus, 'a');
      const b = await peer(bus, 'b');
      const observer = await peer(bus, 'c');
      await bus.settle();
      vi.mocked(a.interaction.cancelObject).mockImplementation(() =>
        manipulate(a.room, 'cancel')
      );
      vi.mocked(b.interaction.cancelObject).mockImplementation(() =>
        manipulate(b.room, 'cancel')
      );
      // Queue both local claims before either peer can observe the other.
      for (const p of reverse ? [b, a] : [a, b]) manipulate(p.room, 'start');
      a.room.getObject('chair')!.position.x = 1;
      b.room.getObject('chair')!.position.x = -1;
      a.session.update();
      b.session.update();
      await bus.settle();
      a.collaboration.update();
      b.collaboration.update();
      await bus.settle();
      expect(binding(a).ownerId).toBe('a');
      expect(binding(b).ownerId).toBe('a');
      expect(binding(observer).ownerId).toBe('a');
      expect(a.interaction.cancelObject).not.toHaveBeenCalled();
      expect(b.interaction.cancelObject).toHaveBeenCalledOnce();
      expect(binding(b)._hasTarget).toBe(true);
      binding(b).stepInterpolation(1);
      binding(observer).stepInterpolation(1);
      expect(b.room.getObject('chair')!.position.x).toBe(1);
      expect(observer.room.getObject('chair')!.position.x).toBe(1);
      manipulate(a.room, 'end');
      await bus.settle();
      expect(binding(a).ownerId).toBe('');
      expect(binding(b).ownerId).toBe('');
      expect(binding(observer).ownerId).toBe('');
      expect(b.room.layout).toEqual(a.room.layout);
      expect(observer.room.layout).toEqual(a.room.layout);
    }
  );

  it('carries released claim generations through late scene materialization and content swaps', async () => {
    const bus = new Bus();
    const a = await peer(bus, 'a');
    const b = await peer(bus, 'b');
    await bus.settle();
    for (const p of [a, b, a]) {
      manipulate(p.room, 'start');
      await bus.settle();
      manipulate(p.room, 'end');
      await bus.settle();
    }
    expect(binding(a).claim).toEqual({counter: 3, peerId: 'a'});
    await a.room.applyPlan({
      title: 'Replaced content',
      edits: [{op: 'update', id: 'chair', changes: {color: '#ffffff'}}],
    });
    await bus.settle();
    const joining = await peer(bus, 'z', {title: 'Empty', objects: []});
    await bus.settle();
    expect(binding(joining).claim).toEqual({counter: 3, peerId: 'a'});
    manipulate(joining.room, 'start');
    await bus.settle();
    for (const p of [a, b, joining]) {
      expect(binding(p).ownerId).toBe('z');
      expect(binding(p).claim).toEqual({counter: 4, peerId: 'z'});
    }
  });

  it('keeps remote highlights outside authored geometry and independent of local selection', async () => {
    const bus = new Bus();
    const a = await peer(bus, 'a');
    const b = await peer(bus, 'b');
    await bus.settle();
    a.room.select('chair');
    await bus.settle();
    b.collaboration.update();
    expect(b.room.selectedId).toBeNull();
    expect(b.collaboration.remoteSelections.get('a')).toBe('chair');
    const outline = b.collaboration.children[0];
    expect(outline).toBeInstanceOf(THREE.Box3Helper);
    expect(outline.xb?.pointerEvents).toBe('none');
    expect(outline.parent).toBe(b.collaboration);
    const before = b.room.getWorldBounds('chair');
    b.collaboration.update();
    expect(b.room.getWorldBounds('chair')).toEqual(before);
    const dispose = vi.spyOn((outline as THREE.Box3Helper).geometry, 'dispose');
    a.room.select(null);
    await bus.settle();
    b.collaboration.update();
    expect(dispose).toHaveBeenCalledTimes(1);
  });

  it('catches up a late joiner with edited content, root pose, selection, and live ownership', async () => {
    const bus = new Bus();
    const a = await peer(bus, 'a');
    await a.room.applyPlan({
      title: 'Edited room',
      edits: [{op: 'add', object: chair('lamp')}],
    });
    a.room.position.x = 1.5;
    manipulate(a.room, 'start');
    a.room.getObject('chair')!.position.x = 1;
    const b = await peer(bus, 'b');
    await bus.settle();
    expect(b.room.layout).toEqual(a.room.layout);
    expect(b.room.position).toEqual(a.room.position);
    expect(binding(b).ownerId).toBe('a');
    expect(b.collaboration.remoteSelections.get('a')).toBe('chair');
    expect(b.planner).not.toHaveBeenCalled();
    expect(a.room.layout.title).toBe('Edited room');
  });

  it('reports invalid messages and asset failures, then accepts valid traffic', async () => {
    const bus = new Bus();
    const a = await peer(bus, 'a');
    const b = await peer(bus, 'b');
    await bus.settle();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const errors = vi.fn();
    b.collaboration.addEventListener('error', errors);
    a.session.events.emit('roomcraft:layout', {version: 7});
    await bus.settle();
    expect(errors).toHaveBeenCalledTimes(1);
    expect(b.room.layout.title).toBe('Room');
    const apply = vi
      .spyOn(b.room, 'applyLayout')
      .mockRejectedValueOnce(new Error('Asset offline'));
    await a.room.applyPlan({title: 'Failed', edits: []});
    await bus.settle();
    expect(b.collaboration.status).toBe('error');
    expect(b.room.layout.title).toBe('Room');
    apply.mockRestore();
    b.collaboration.resync();
    await bus.settle();
    expect(b.room.layout.title).toBe('Failed');
    expect(b.collaboration.status).toBe('ready');
  });

  it('enforces the existing layout bounds instead of transmitting unimportable scenes', async () => {
    const bus = new Bus();
    const a = await peer(bus, 'a');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    bus.sent.length = 0;
    a.room.getObject('chair')!.position.x = 20;
    a.room.dispatchEvent({type: 'change', layout: a.room.layout});
    expect(a.collaboration.status).toBe('error');
    expect(layouts(bus)).toHaveLength(0);
    expect(a.room.getObject('chair')!.position.x).toBe(20);
  });

  it('shares a newly created object after another object moves slightly below the scene origin', async () => {
    const bus = new Bus();
    const quest = await peer(bus, 'quest');
    const laptop = await peer(bus, 'laptop');
    await bus.settle();
    const errors = vi.fn();
    quest.collaboration.addEventListener('error', errors);
    laptop.collaboration.addEventListener('error', errors);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    manipulate(quest.room, 'start');
    await bus.settle();
    quest.room.getObject('chair')!.position.y = -0.007683446861092402;
    quest.session.update();
    await bus.settle();
    binding(laptop).stepInterpolation(1);
    manipulate(quest.room, 'end');
    await bus.settle();
    await quest.room.applyPlan({
      title: 'Room with cat',
      edits: [
        {
          op: 'add',
          object: {...chair('cat'), name: 'Cat', position: [0, 0.85, 0]},
        },
      ],
    });
    quest.room.select('cat');
    await bus.settle();
    expect(laptop.collaboration.remoteSelections.get('quest')).toBe('cat');
    expect(laptop.room.getObject('cat')).toBeDefined();
    expect(laptop.room.layout).toEqual(quest.room.layout);
    expect(laptop.room.getObject('chair')!.position.y).toBe(
      -0.007683446861092402
    );
    laptop.collaboration.resync();
    await bus.settle();
    expect(laptop.room.layout).toEqual(quest.room.layout);
    expect(errors).not.toHaveBeenCalled();
    expect(quest.planner).not.toHaveBeenCalled();
    expect(laptop.planner).not.toHaveBeenCalled();
  });

  it('reports a peer snapshot rejection immediately instead of replacing it with a timeout', async () => {
    const bus = new Bus();
    const a = await peer(bus, 'a');
    const b = await peer(bus, 'b');
    await bus.settle();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const errors = vi.fn();
    b.collaboration.addEventListener('error', errors);
    a.room.getObject('chair')!.position.y = -11;
    b.collaboration.resync();
    await bus.settle();
    expect(errors).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'request sync',
        peerId: 'a',
        error: expect.objectContaining({
          message: expect.stringContaining('Object "chair" position.y'),
        }),
      })
    );
    expect(b.collaboration.pendingCount).toBe(0);
    a.room.getObject('chair')!.position.y = -0.01;
    b.collaboration.resync();
    await bus.settle();
    expect(b.room.getObject('chair')!.position.y).toBe(-0.01);
    expect(b.collaboration.status).toBe('ready');
  });

  it('retries a missing snapshot reply using the same request and stops once it arrives', async () => {
    const bus = new Bus();
    const a = await peer(bus, 'a');
    const b = await peer(bus, 'b');
    await bus.settle();
    vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']});
    try {
      const emit = a.session.events.emitTo.bind(a.session.events);
      let drop = true;
      vi.spyOn(a.session.events, 'emitTo').mockImplementation(
        (to, topic, payload) => {
          if (topic === 'roomcraft:sync-state' && drop) {
            drop = false;
            return;
          }
          emit(to, topic, payload);
        }
      );
      bus.sent.length = 0;
      b.collaboration.resync();
      await bus.settle();
      expect(b.collaboration.status).toBe('syncing');
      await vi.advanceTimersByTimeAsync(1000);
      await bus.settle();
      expect(b.collaboration.status).toBe('ready');
      const requests = () =>
        bus.sent.flatMap(({from, message}) =>
          from === 'b' &&
          message.type === 'rpc' &&
          message.topic === 'roomcraft:sync-request'
            ? [message.payload]
            : []
        );
      expect(requests()).toHaveLength(2);
      expect(requests()[1]).toEqual(requests()[0]);
      await vi.advanceTimersByTimeAsync(2000);
      await bus.settle();
      expect(requests()).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('keeps a received snapshot validation error instead of later reporting that no reply arrived', async () => {
    const bus = new Bus();
    const a = await peer(bus, 'a');
    const b = await peer(bus, 'b');
    await bus.settle();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const errors = vi.fn();
    b.collaboration.addEventListener('error', errors);
    vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']});
    try {
      const emit = a.session.events.emitTo.bind(a.session.events);
      vi.spyOn(a.session.events, 'emitTo').mockImplementation(
        (to, topic, payload) => {
          if (topic === 'roomcraft:sync-state') {
            const data = record(payload);
            emit(to, topic, {
              ...data,
              snapshot: {
                ...record(data.snapshot),
                layout: {
                  title: 'Invalid',
                  objects: [{...chair(), position: [11, 0, 0]}],
                },
              },
            });
          } else emit(to, topic, payload);
        }
      );
      b.collaboration.resync();
      await bus.settle();
      expect(b.collaboration.pendingCount).toBe(0);
      expect(errors).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: expect.stringContaining('Object "chair" position.x'),
          }),
        })
      );
      await vi.advanceTimersByTimeAsync(8001);
      await bus.settle();
      expect(
        errors.mock.calls.some(([event]) =>
          event.error.message.includes('No scene snapshot arrived')
        )
      ).toBe(false);
      expect(b.room.layout.title).toBe('Room');
    } finally {
      vi.useRealTimers();
    }
  });

  it('ignores snapshot errors from a disposed bridge request', async () => {
    const bus = new Bus();
    const a = await peer(bus, 'a');
    const b = await peer(bus, 'b');
    await bus.settle();
    const oldRequest = bus.sent
      .flatMap(({from, message}) =>
        from === 'b' &&
        message.type === 'rpc' &&
        message.topic === 'roomcraft:sync-request'
          ? [record(message.payload).id]
          : []
      )
      .at(-1);
    expect(typeof oldRequest).toBe('string');
    b.collaboration.dispose();
    const replacement = new RoomcraftNet(b.room, b.session);
    bridges.push(replacement);
    await replacement.init({interaction: b.interaction});
    const errors = vi.fn();
    replacement.addEventListener('error', errors);
    a.session.events.emitTo('b', 'roomcraft:sync-error', {
      id: oldRequest,
      reason: 'Stale failure',
    });
    await bus.settle();
    expect(errors).not.toHaveBeenCalled();
    expect(replacement.status).toBe('ready');
    const latest = bus.sent
      .flatMap(({from, message}) =>
        from === 'b' &&
        message.type === 'rpc' &&
        message.topic === 'roomcraft:sync-request'
          ? [record(message.payload).id]
          : []
      )
      .at(-1);
    expect(latest).not.toBe(oldRequest);
  });

  it.each([null, '', 'x'.repeat(513)])(
    'rejects malformed snapshot error reasons',
    async (reason) => {
      const bus = new Bus();
      const a = await peer(bus, 'a');
      const b = await peer(bus, 'b');
      await bus.settle();
      vi.spyOn(console, 'error').mockImplementation(() => {});
      const emit = a.session.events.emitTo.bind(a.session.events);
      vi.spyOn(a.session.events, 'emitTo').mockImplementation(
        (to, topic, payload) => {
          if (topic !== 'roomcraft:sync-state') emit(to, topic, payload);
        }
      );
      b.collaboration.resync();
      await bus.settle();
      const id = bus.sent
        .flatMap(({from, message}) =>
          from === 'b' &&
          message.type === 'rpc' &&
          message.topic === 'roomcraft:sync-request'
            ? [record(message.payload).id]
            : []
        )
        .at(-1);
      const errors = vi.fn();
      b.collaboration.addEventListener('error', errors);
      a.session.events.emitTo('b', 'roomcraft:sync-error', {id, reason});
      await bus.settle();
      expect(errors).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            message: 'Invalid scene snapshot error response.',
          }),
        })
      );
    }
  );

  it('cancels pending snapshot retransmission when the bridge is disposed', async () => {
    const bus = new Bus();
    const a = await peer(bus, 'a');
    const b = await peer(bus, 'b');
    await bus.settle();
    vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']});
    try {
      const emit = a.session.events.emitTo.bind(a.session.events);
      vi.spyOn(a.session.events, 'emitTo').mockImplementation(
        (to, topic, payload) => {
          if (topic !== 'roomcraft:sync-state') emit(to, topic, payload);
        }
      );
      b.collaboration.resync();
      await bus.settle();
      b.collaboration.dispose();
      bus.sent.length = 0;
      await vi.advanceTimersByTimeAsync(3000);
      await bus.settle();
      expect(
        bus.sent.filter(
          ({from, message}) =>
            from === 'b' &&
            message.type === 'rpc' &&
            message.topic === 'roomcraft:sync-request'
        )
      ).toHaveLength(0);
    } finally {
      vi.useRealTimers();
    }
  });

  it('returns to ready when a timed-out motion clock later recovers', async () => {
    const bus = new Bus();
    const a = await peer(bus, 'a');
    await a.room.applyPlan({title: 'Established clock', edits: []});
    const b = await peer(bus, 'b');
    await bus.settle();
    expect(b.collaboration.motionClockState?.authority).toBe('a');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.useFakeTimers({toFake: ['setTimeout', 'clearTimeout']});
    try {
      const emit = a.session.events.emitTo.bind(a.session.events);
      const drop = vi
        .spyOn(a.session.events, 'emitTo')
        .mockImplementation((to, topic, payload) => {
          if (topic !== 'roomcraft:clock-reply') emit(to, topic, payload);
        });
      b.collaboration.resync();
      await bus.settle();
      await vi.advanceTimersByTimeAsync(8001);
      await bus.settle();
      expect(b.collaboration.status).toBe('error');
      drop.mockRestore();
      await vi.advanceTimersByTimeAsync(5000);
      await bus.settle();
      expect(b.collaboration.motionClockState?.synchronized).toBe(true);
      expect(b.collaboration.status).toBe('ready');
    } finally {
      vi.useRealTimers();
    }
  });

  it('does not overwrite an unsent local edit with older peer state during retry or reconnect', async () => {
    const bus = new Bus();
    const a = await peer(bus, 'a');
    const b = await peer(bus, 'b');
    await bus.settle();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    a.room.getObject('chair')!.position.x = 11;
    await a.room.applyPlan({
      title: 'Local cat not yet shared',
      edits: [{op: 'add', object: chair('cat')}],
    });
    expect(a.collaboration.status).toBe('error');
    a.collaboration.resync();
    await bus.settle();
    expect(a.room.getObject('cat')).toBeDefined();
    expect(a.room.getObject('chair')!.position.x).toBe(11);
    expect(a.collaboration.status).toBe('error');
    a.collaboration.dispose();
    a.session.close();
    const session = new NetSession(
      new TestTransport(bus, 'a2'),
      new THREE.Group()
    );
    sessions.push(session);
    await session.open('room');
    const replacement = new RoomcraftNet(a.room, session);
    bridges.push(replacement);
    await replacement.init({interaction: a.interaction});
    await bus.settle();
    expect(a.room.getObject('cat')).toBeDefined();
    expect(replacement.status).toBe('error');
    a.room.getObject('chair')!.position.x = 1;
    replacement.resync();
    await bus.settle();
    expect(b.room.getObject('cat')).toBeDefined();
    expect(b.room.layout).toEqual(a.room.layout);
    expect(replacement.status).toBe('ready');
  });

  it('reports a legal Unicode scene that exceeds the encoded transport byte limit', async () => {
    const bus = new Bus();
    const a = await peer(bus, 'a');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const errors = vi.fn();
    a.collaboration.addEventListener('error', errors);
    bus.sent.length = 0;
    await a.room.applyLayout({
      title: 'Large scene',
      objects: Array.from({length: 8}, (_, objectIndex) => ({
        id: `object-${objectIndex}`,
        name: 'Design',
        color: '#ffffff',
        position: [0, 0, 0],
        rotation: 0,
        scale: [1, 1, 1],
        parts: Array.from({length: 48}, (_, partIndex) => ({
          id: `part-${partIndex}`,
          name: '\u4e16'.repeat(70),
          shape: 'box',
          parent: null,
          position: [0, 0.1, 0],
          rotation: [0, 0, 0],
          size: [0.1, 0.1, 0.1],
          color: '#ffffff',
        })),
      })),
    });
    expect(a.room.layout.objects).toHaveLength(8);
    expect(layouts(bus)).toHaveLength(0);
    expect(errors).toHaveBeenCalledWith(
      expect.objectContaining({
        error: expect.objectContaining({
          message: expect.stringContaining('60 KB'),
        }),
      })
    );
  });

  it('rejects a second bridge instead of replacing its registered bindings', async () => {
    const bus = new Bus();
    const a = await peer(bus, 'a');
    const original = binding(a);
    const duplicate = new RoomcraftNet(a.room, a.session);
    await expect(duplicate.init({interaction: a.interaction})).rejects.toThrow(
      'already registered'
    );
    expect(binding(a)).toBe(original);
  });

  it('reserves the bridge namespace even when the scene is empty', async () => {
    const bus = new Bus();
    const a = await peer(bus, 'a', {title: 'Empty room', objects: []});
    const duplicate = new RoomcraftNet(a.room, a.session);
    await expect(duplicate.init({interaction: a.interaction})).rejects.toThrow(
      'already registered'
    );
    duplicate.dispose();
    const third = new RoomcraftNet(a.room, a.session);
    await expect(third.init({interaction: a.interaction})).rejects.toThrow(
      'already registered'
    );
    third.dispose();
  });

  it('does not erase another consumer registry entry and cleans up only owned resources', async () => {
    const bus = new Bus();
    const a = await peer(bus, 'a');
    const other = new NetObject({id: 'unrelated'});
    a.session.netObjects.add(other);
    a.collaboration.dispose();
    expect(a.session.netObjects.get('unrelated')).toBe(other);
    expect(a.session.netObjects.has('roomcraft:object:chair')).toBe(false);
    expect(a.room.getObject('chair')).toBeDefined();
    expect(a.session.isOpen).toBe(true);
    bus.sent.length = 0;
    await a.room.applyPlan({title: 'Local only', edits: []});
    expect(layouts(bus)).toHaveLength(0);
  });

  it('does not reattach bindings or publish after disposal during a remote apply', async () => {
    const bus = new Bus();
    const a = await peer(bus, 'a');
    const b = await peer(bus, 'b');
    await bus.settle();
    let finish!: (layout: SceneLayout) => void;
    vi.spyOn(b.room, 'applyLayout').mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = resolve;
        })
    );
    await a.room.applyPlan({title: 'Pending', edits: []});
    await bus.settle();
    b.collaboration.dispose();
    bus.sent.length = 0;
    finish(a.room.layout);
    await bus.settle();
    expect(b.collaboration.status).toBe('closed');
    expect(b.session.netObjects.has('roomcraft:object:chair')).toBe(false);
    expect(layouts(bus)).toHaveLength(0);
  });

  it.each(['dispose', 'close'] as const)(
    'cancels real asset staging on %s without a late write or false offline revision',
    async (action) => {
      const bus = new Bus();
      const a = await peer(bus, 'a');
      let delayed = false;
      let finish!: (object: THREE.Object3D) => void;
      const loading = new Promise<THREE.Object3D>((resolve) => {
        finish = resolve;
      });
      const catalog = createDefaultCatalog().map((asset) => ({
        ...asset,
        create: (color: string) =>
          delayed && asset.id === 'box' ? loading : asset.create(color),
      }));
      const b = await peer(bus, 'b', undefined, undefined, {catalog});
      await bus.settle();
      const before = b.room.layout;
      const owner = b.room.getObject('chair')!;
      const current = owner.children[0];
      const changes = vi.fn();
      b.room.addEventListener('change', changes);
      delayed = true;
      await a.room.applyPlan({
        title: 'Remote pending content',
        edits: [{op: 'update', id: 'chair', changes: {color: '#ffffff'}}],
      });
      await bus.settle();
      expect(b.room.busy).toBe(true);
      if (action === 'dispose') b.collaboration.dispose();
      else b.session.close();
      await bus.settle();
      expect.soft(b.room.busy).toBe(false);
      expect.soft(b.room.status).toBe('ready');
      const staged = new THREE.Mesh(
        new THREE.BoxGeometry(),
        new THREE.MeshBasicMaterial()
      );
      const disposeGeometry = vi.spyOn(staged.geometry, 'dispose');
      const disposeMaterial = vi.spyOn(staged.material, 'dispose');
      finish(staged);
      await bus.settle();
      expect.soft(disposeGeometry).toHaveBeenCalledOnce();
      expect.soft(disposeMaterial).toHaveBeenCalledOnce();
      expect(b.room.layout).toEqual(before);
      expect(b.room.getObject('chair')).toBe(owner);
      expect(owner.children[0]).toBe(current);
      expect(changes).not.toHaveBeenCalled();
      expect(b.collaboration.status).toBe('closed');
      b.session.close();
      delayed = false;
      const session = new NetSession(
        new TestTransport(bus, 'b2'),
        new THREE.Group()
      );
      sessions.push(session);
      await session.open('room');
      const bridge = new RoomcraftNet(b.room, session);
      bridges.push(bridge);
      await bridge.init({interaction: b.interaction});
      await bus.settle();
      expect(b.room.layout).toEqual(a.room.layout);
      a.collaboration.resync();
      await bus.settle();
      const snapshots = bus.sent.flatMap(({from, message}) =>
        from === 'b2' &&
        message.type === 'rpc' &&
        message.topic === 'roomcraft:sync-state'
          ? [message.payload]
          : []
      );
      expect(snapshots.at(-1)).toMatchObject({
        snapshot: {revision: {counter: 2, peerId: 'a'}},
      });
      await b.room.applyPlan({title: 'Usable after cancellation', edits: []});
      expect(b.room.status).toBe('ready');
    }
  );

  it('preserves a release received during loading and never restores a departed owner', async () => {
    const bus = new Bus();
    const a = await peer(bus, 'a');
    const b = await peer(bus, 'b');
    await bus.settle();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    manipulate(a.room, 'start');
    await bus.settle();
    let finish!: () => void;
    const gate = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const apply = b.room.applyLayout.bind(b.room);
    vi.spyOn(b.room, 'applyLayout').mockImplementationOnce(async (value) => {
      await gate;
      return apply(value);
    });
    a.room.getObject('chair')!.position.x = 1;
    await a.room.applyPlan({
      title: 'Edited during grab',
      edits: [{op: 'update', id: 'chair', changes: {color: '#ffffff'}}],
    });
    await bus.settle();
    a.room.getObject('chair')!.position.x = 2;
    a.collaboration.dispose();
    a.session.close();
    await bus.settle();
    expect(binding(b).ownerId).toBe('');
    finish();
    await bus.settle();
    expect(b.room.getObject('chair')!.position.x).toBe(2);
    expect(binding(b).ownerId).toBe('');
    expect(b.session.users.size).toBe(0);
    expect(b.collaboration.status).toBe('error');
    expect(b.collaboration.pendingCount).toBe(0);
  });
});
