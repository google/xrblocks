import {describe, it, expect, vi, afterEach} from 'vitest';

import {WorldOptions} from '../WorldOptions';

import {AnchorManager} from './AnchorManager';
import {AnchorStore} from './AnchorStore';
import {AnchorRecord} from './AnchorTypes';
import {SimulatorAnchor} from './SimulatorAnchor';

function memoryStore(seed: AnchorRecord[] = []): AnchorStore & {
  records: AnchorRecord[];
} {
  const records = [...seed];
  return {
    records,
    load: () => [...records],
    save: (r) => {
      const i = records.findIndex((x) => x.uuid === r.uuid);
      if (i >= 0) records[i] = r;
      else records.push(r);
    },
    remove: (uuid) => {
      const i = records.findIndex((x) => x.uuid === uuid);
      if (i >= 0) records.splice(i, 1);
    },
    clear: () => void records.splice(0, records.length),
  };
}

/** A frame from a platform with no anchor support at all. */
function bareFrame(): XRFrame {
  return {session: {}, getPose: () => null} as unknown as XRFrame;
}

const POSE = {
  position: {x: 1, y: 2, z: 3},
  orientation: {x: 0, y: 0, z: 0, w: 1},
} as XRRigidTransform;

function makeManager(store = memoryStore()) {
  const options = new WorldOptions();
  options.anchors.enablePersistence();
  options.anchors.simulatorFallback = true;
  const manager = new AnchorManager(store);
  manager.init({options});
  return {manager, store, options};
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('SimulatorAnchor', () => {
  it('reports the pose it was built with', () => {
    const anchor = new SimulatorAnchor('id', POSE);
    expect(anchor.pose.position).toEqual({x: 1, y: 2, z: 3});
  });

  it('hands back its own id as the persistent handle', async () => {
    const anchor = new SimulatorAnchor('sim-1', POSE);
    await expect(anchor.requestPersistentHandle!()).resolves.toBe('sim-1');
  });

  it('is identifiable so callers can tell it is not a real anchor', () => {
    expect(
      SimulatorAnchor.isSimulatorAnchor(new SimulatorAnchor('a', POSE))
    ).toBe(true);
    expect(SimulatorAnchor.isSimulatorAnchor({} as XRAnchor)).toBe(false);
  });
});

describe('AnchorManager simulator fallback', () => {
  it('creates a simulated anchor when the platform has none', async () => {
    const {manager} = makeManager();
    manager.update(0, bareFrame());
    const tracked = await manager.create(POSE, 'sofa');
    expect(tracked).not.toBeNull();
    expect(SimulatorAnchor.isSimulatorAnchor(tracked!.anchor)).toBe(true);
  });

  it('reports capability as simulated rather than claiming real support', () => {
    const {manager} = makeManager();
    manager.update(0, bareFrame());
    expect(manager.capability).toBe('simulated');
  });

  it('stays unsupported when the fallback is not enabled', async () => {
    const options = new WorldOptions();
    options.anchors.enablePersistence();
    const manager = new AnchorManager(memoryStore());
    manager.init({options});
    manager.update(0, bareFrame());
    expect(manager.capability).toBe('unsupported');
    await expect(manager.create(POSE, 'sofa')).resolves.toBeNull();
  });

  it('persists a simulated anchor with its pose', async () => {
    const {manager, store} = makeManager();
    manager.update(0, bareFrame());
    const tracked = await manager.create(POSE, 'sofa');
    await expect(manager.persist(tracked!.id)).resolves.toBe(true);
    const saved = store.load()[0];
    expect(saved.label).toBe('sofa');
    expect(saved.pose?.position).toEqual([1, 2, 3]);
  });

  it('restores simulated anchors from saved poses', async () => {
    const store = memoryStore([
      {
        uuid: 'sim-a',
        label: 'lamp',
        createdAt: 1,
        pose: {position: [4, 5, 6], orientation: [0, 0, 0, 1]},
      },
    ]);
    const {manager} = makeManager(store);
    manager.update(0, bareFrame());
    const results = await manager.restoreAll();
    expect(results.map((r) => r.status)).toEqual(['restored']);
    const restored = manager.getAll()[0];
    expect(restored.label).toBe('lamp');
    expect((restored.anchor as SimulatorAnchor).pose.position).toEqual({
      x: 4,
      y: 5,
      z: 6,
    });
  });

  it('reports not-found for a saved record with no pose to rebuild from', async () => {
    const store = memoryStore([{uuid: 'sim-a', label: 'lamp', createdAt: 1}]);
    const {manager} = makeManager(store);
    manager.update(0, bareFrame());
    const results = await manager.restoreAll();
    expect(results.map((r) => r.status)).toEqual(['not-found']);
  });

  it('round-trips create, persist and restore', async () => {
    const store = memoryStore();
    const first = makeManager(store);
    first.manager.update(0, bareFrame());
    const tracked = await first.manager.create(POSE, 'chair');
    await first.manager.persist(tracked!.id);

    // A fresh manager stands in for a reload sharing the same storage.
    const second = makeManager(store);
    second.manager.update(0, bareFrame());
    const results = await second.manager.restoreAll();
    expect(results.map((r) => r.status)).toEqual(['restored']);
    expect(second.manager.getAll()[0].label).toBe('chair');
  });
});
