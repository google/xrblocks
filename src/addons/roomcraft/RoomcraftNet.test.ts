vi.hoisted(() => {
  vi.stubGlobal('AudioContext', function () {
    return {createGain: () => ({connect() {}}), destination: {}};
  });
});
import * as THREE from 'three';
import {afterEach, describe, expect, it, vi} from 'vitest';
import {
  Interaction,
  ScriptsManager,
  type Controller,
  type ManipulationEvent,
} from 'xrblocks';
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
const interactions: Interaction[] = [];
const scriptManagers: ScriptsManager[] = [];

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
  const callbacks = new ScriptsManager(async () => {});
  scriptManagers.push(callbacks);
  await callbacks.initScript(room);
  const interaction = new Interaction({callbacks});
  interactions.push(interaction);
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
    scale: owner.scale.clone(),
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

afterEach(async () => {
  bridges.splice(0).forEach((bridge) => bridge.dispose());
  interactions.splice(0).forEach((interaction) => interaction.clear());
  sessions.splice(0).forEach((session) => session.close());
  await Promise.all(
    scriptManagers.splice(0).map((manager) => manager.dispose())
  );
  rooms.splice(0).forEach((room) => room.dispose());

  vi.restoreAllMocks();
});

describe('RoomcraftNet', () => {
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

  it.each([false, true])(
    'resolves crossed grabs to one held owner and its pose (reverse=%s)',
    async (reverse) => {
      const bus = new Bus();
      const a = await peer(bus, 'a');
      const b = await peer(bus, 'b');
      const observer = await peer(bus, 'c');
      await bus.settle();
      const controllers = new Map<typeof a, Controller>();
      function select(p: typeof a, selected: boolean) {
        let controller = controllers.get(p);
        if (!controller) {
          controller = new THREE.Object3D() as Controller;
          controller.userData = {id: 0, connected: true, selected: false};
          controllers.set(p, controller);
        }
        controller.userData.selected = selected;
        const owner = p.room.getObject('chair')!;
        const point = owner.getWorldPosition(new THREE.Vector3());
        const position = point.clone().add(new THREE.Vector3(0, 0, 1));
        p.interaction.update({
          raySources: [
            {
              controller,
              sourceType: 'controller-ray',
              selected,
              position,
              orientation: new THREE.Quaternion(),
              ray: new THREE.Ray(position, new THREE.Vector3(0, 0, -1)),
              intersections: [{object: owner.children[0], distance: 1, point}],
            },
          ],
          directTouches: [],
        });
      }
      // Queue both local claims before either peer can observe the other.
      for (const p of reverse ? [b, a] : [a, b]) {
        select(p, false);
        select(p, true);
        expect(p.interaction.isSelectingAt(p.room.getObject('chair')!)).toBe(
          true
        );
      }
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
      expect(a.interaction.isSelectingAt(a.room.getObject('chair')!)).toBe(
        true
      );
      expect(b.interaction.isSelectingAt(b.room.getObject('chair')!)).toBe(
        false
      );
      binding(b).stepInterpolation(1);
      binding(observer).stepInterpolation(1);
      expect(b.room.getObject('chair')!.position.x).toBe(1);
      expect(observer.room.getObject('chair')!.position.x).toBe(1);
      select(a, false);
      await bus.settle();
      expect(binding(a).ownerId).toBe('');
      expect(binding(b).ownerId).toBe('');
      expect(binding(observer).ownerId).toBe('');
      expect(b.room.layout).toEqual(a.room.layout);
      expect(observer.room.layout).toEqual(a.room.layout);
    }
  );

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
});
