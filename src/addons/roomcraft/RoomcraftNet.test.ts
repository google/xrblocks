import * as THREE from 'three';
import {afterEach, describe, expect, it, vi} from 'vitest';
import type {Interaction, ManipulationEvent} from 'xrblocks';
import {
  decodeMessage,
  NetObject,
  NetSession,
  Transport,
  type NetMessage,
} from '../netblocks/src/index';
import {Roomcraft} from './Roomcraft';
import {createDefaultCatalog} from './Catalog';
import {RoomcraftNet} from './RoomcraftNet';
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
