import * as THREE from 'three';
import {afterEach, expect, it, vi} from 'vitest';

import {RendererHolder} from '../../core/RendererTypes';
import {XRReferenceSpaceCache} from '../../core/components/XRReferenceSpaceCache';
import {WorldOptions} from '../WorldOptions';
import {AnchorManager} from './AnchorManager';
import {LocalStorageAnchorStore} from './LocalStorageAnchorStore';

import {AnchoredObjects} from './AnchoredObjects';

function transform(x = 1, y = 2, z = 3) {
  const matrix = new THREE.Matrix4().makeTranslation(x, y, z).toArray();
  return {
    position: {x, y, z, w: 1},
    orientation: {x: 0, y: 0, z: 0, w: 1},
    matrix,
  } as unknown as XRRigidTransform;
}
function store(key = 'world.anchor-tests', cap = 8) {
  return new LocalStorageAnchorStore(key, cap, localStorage);
}
function simulated(storage = store()) {
  const options = new WorldOptions();
  options.anchors.enablePersistence();
  options.anchors.simulatorFallback = true;
  const manager = new AnchorManager(storage);
  manager.init({options});
  manager.update();
  return manager;
}

/** Only native XR APIs are substituted. Manager, cache, store, and math are real. */
async function platform(
  capability: 'persistent' | 'session-only' | 'unsupported' = 'persistent',
  storage = store()
) {
  let id = 0;
  const held = new Set<string>();
  const spaces = new Map<XRReferenceSpaceType, XRReferenceSpace>();
  const anchor = (uuid: string) => ({
    anchorSpace: {},
    delete: vi.fn(),
    requestPersistentHandle: async () => {
      held.add(uuid);
      return uuid;
    },
  });
  const session = Object.assign(new EventTarget(), {
    requestReferenceSpace: async (type: XRReferenceSpaceType) => {
      const space = {} as XRReferenceSpace;
      spaces.set(type, space);
      return space;
    },
    restorePersistentAnchor:
      capability === 'persistent'
        ? vi.fn(async (uuid: string) => {
            if (uuid === 'bad') throw new Error('cannot localize');
            return anchor(uuid);
          })
        : undefined,
    deletePersistentAnchor: vi.fn(async (uuid: string) => {
      held.delete(uuid);
    }),
    get persistentAnchors() {
      return [...held];
    },
  });
  Object.defineProperty(session, 'persistentAnchors', {get: () => [...held]});
  const frame = {
    session,
    createAnchor:
      capability !== 'unsupported'
        ? vi.fn(async (_pose: XRRigidTransform, _space: XRSpace) =>
            anchor(`native-${id++}`)
          )
        : undefined,
    getPose: vi.fn((_from: XRSpace, _to: XRSpace) => ({
      transform: transform(),
    })),
  } as unknown as XRFrame;
  let live: XRFrame | null = frame;
  const renderer = {
    xr: {
      getSession: () => session,
      getFrame: () => live,
      getReferenceSpace: () => spaces.get('bounded-floor'),
    },
  };
  const cache = new XRReferenceSpaceCache();
  cache.onXRSessionStart(session as unknown as XRSession);
  await Promise.resolve();
  const options = new WorldOptions();
  options.anchors.enablePersistence();
  const manager = new AnchorManager(storage);
  manager.init({
    options,
    rendererHolder: new RendererHolder(renderer as never),
    xrReferenceSpaceCache: cache,
  });
  manager.update(0, frame);
  return {
    manager,
    frame,
    session,
    held,
    spaces,
    cache,
    storage,
    live(value: boolean) {
      live = value ? frame : null;
    },
    tick() {
      live = frame;
      manager.update(0, frame);
      live = null;
    },
  };
}

const managers: {dispose(): void}[] = [];
afterEach(() => {
  for (const manager of managers.splice(0)) manager.dispose();
  localStorage.removeItem('world.anchor-tests');
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
async function setup(...args: Parameters<typeof platform>) {
  const f = await platform(...args);
  managers.push(f.manager);
  return f;
}

it.each(['persistent', 'session-only', 'unsupported'] as const)(
  'creates and saves only what the %s platform supports',
  async (capability) => {
    const f = await setup(capability);
    expect(f.manager.capability).toBe(capability);
    const tracked = await f.manager.create(transform(), 'lamp');
    if (capability === 'unsupported') {
      expect(tracked).toBeNull();
      return;
    }
    expect(tracked!.label).toBe('lamp');
    expect(await f.manager.persist(tracked!.id)).toBe(
      capability === 'persistent'
    );
    expect(f.storage.load().map((record) => record.label)).toEqual(
      capability === 'persistent' ? ['lamp'] : []
    );
  }
);

it('round-trips native handles across sessions without duplicating restored anchors', async () => {
  const f = await setup();
  const a = (await f.manager.create(transform(), 'lamp'))!;
  const b = (await f.manager.create(transform(), 'chair'))!;
  await f.manager.persist(a.id);
  await f.manager.persist(a.id);
  await f.manager.persist(b.id);
  const records = f.storage.load();
  expect(records.map(({uuid}) => uuid)).toEqual(['native-0', 'native-1']);
  f.manager.onSessionEnded();
  expect(f.manager.getAll()).toEqual([]);
  expect(f.storage.load()).toEqual(records);
  const next = await setup();
  const restored = await next.manager.restoreAll();
  expect(restored.map(({status}) => status)).toEqual(['restored', 'restored']);
  await next.manager.restoreAll();
  expect(next.manager.getAll().map(({label}) => label)).toEqual([
    'lamp',
    'chair',
  ]);
  expect(
    next.manager.getPose(restored[0].anchor!.id)?.transform.position
  ).toEqual(transform().position);
  next.manager.delete(restored[0].anchor!.id);
  expect(next.storage.load().map(({label}) => label)).toEqual(['chair']);
  expect(next.session.deletePersistentAnchor).toHaveBeenCalledWith('native-0');
});

it('keeps restoring after an invalid handle and keeps records when tracking is lost', async () => {
  const f = await setup();
  for (const uuid of ['native-a', 'bad', 'native-c'])
    f.storage.save({uuid, label: uuid, createdAt: 1});
  const restored = await f.manager.restoreAll();
  expect(restored.map(({status}) => status)).toEqual([
    'restored',
    'not-found',
    'restored',
  ]);
  (f.frame as unknown as {trackedAnchors: Set<XRAnchor>}).trackedAnchors =
    new Set();
  f.manager.update(1, f.frame);
  expect(f.manager.getAll()).toEqual([]);
  expect(f.storage.load()).toHaveLength(3);
});

it('waits for a live frame and cancels queued work when the session ends', async () => {
  const f = await setup();
  f.live(false);
  const pending = f.manager.create(transform(), 'from click');
  f.tick();
  expect((await pending)?.label).toBe('from click');
  const cancelled = f.manager.create(transform(), 'cancelled');
  f.manager.onSessionEnded();
  await expect(cancelled).resolves.toBeNull();
});

it('recovers from an inactive frame without blocking later creates', async () => {
  const f = await setup();
  vi.mocked(f.frame.createAnchor!).mockRejectedValueOnce(
    new Error('inactive frame')
  );
  const pending = f.manager.create(transform(), 'retry');
  await new Promise((resolve) => setTimeout(resolve, 0));
  f.tick();
  expect((await pending)?.label).toBe('retry');
  f.live(true);
  expect((await f.manager.create(transform(), 'next'))?.label).toBe('next');
});

it('converts an explicit pose space with the real reference-space cache', async () => {
  vi.stubGlobal(
    'XRRigidTransform',
    class {
      position: DOMPointInit;
      orientation: DOMPointInit;
      matrix: number[];
      constructor(p: DOMPointInit, q: DOMPointInit) {
        this.position = {...p};
        this.orientation = {...q};
        this.matrix = new THREE.Matrix4()
          .compose(
            new THREE.Vector3(p.x, p.y, p.z),
            new THREE.Quaternion(q.x, q.y, q.z, q.w),
            new THREE.Vector3(1, 1, 1)
          )
          .toArray();
      }
    }
  );
  const f = await setup();
  vi.mocked(f.frame.getPose).mockReturnValue({
    transform: transform(10, 0, 0),
  } as XRPose);
  await f.manager.create(transform(1, 2, 3), 'chair', 'viewer', 'local-floor');
  const [pose, space] = vi.mocked(f.frame.createAnchor!).mock.calls[0];
  expect(pose.position).toMatchObject({x: 11, y: 2, z: 3});
  expect(space).toBe(f.spaces.get('local-floor'));
  await expect(
    f.manager.create(
      transform(),
      'unknown pose',
      'missing' as XRReferenceSpaceType
    )
  ).resolves.toBeNull();
});

it('releases evicted and forgotten native handles while preserving saved ones on dispose', async () => {
  const f = await setup('persistent', store(undefined, 1));
  const first = (await f.manager.create(transform(), 'first'))!;
  await f.manager.persist(first.id);
  const second = (await f.manager.create(transform(), 'second'))!;
  await f.manager.persist(second.id);
  expect([...f.held]).toEqual(['native-1']);
  f.manager.dispose();
  expect(f.storage.load().map(({label}) => label)).toEqual(['second']);
  f.manager.forgetAll();
  expect(f.storage.load()).toEqual([]);
  expect([...f.held]).toEqual([]);
});

it('continues platform recovery after a handle deletion fails', async () => {
  const f = await setup();
  for (const uuid of ['a', 'b', 'c']) {
    f.held.add(uuid);
    f.storage.save({uuid, label: uuid, createdAt: 1});
  }
  f.session.deletePersistentAnchor.mockImplementation(async (uuid) => {
    if (uuid === 'b') throw new Error('refused');
    f.held.delete(uuid);
  });
  expect(await f.manager.releaseAllPlatformHandles()).toBe(2);
  expect([...f.held]).toEqual(['b']);
  expect(f.storage.load()).toEqual([]);
});

it('persists and restores desktop poses without native frames or tracked anchors', async () => {
  const first = simulated();
  const second = simulated();
  try {
    const tracked = (await first.create(transform(4, 5, 6), 'chair'))!;
    await first.persist(tracked.id);
    await first.persist(tracked.id);
    expect(store().load()).toHaveLength(1);
    const [result] = await second.restoreAll();
    expect(result.status).toBe('restored');
    const frame = {
      session: {},
      trackedAnchors: new Set(),
      getPose: () => null,
    } as unknown as XRFrame;
    second.update(1, frame);
    expect(second.getPose(result.anchor!.id)?.transform.position).toMatchObject(
      {x: 4, y: 5, z: 6}
    );
  } finally {
    first.dispose();
    second.dispose();
  }
});
it('does not create desktop anchors when the fallback is disabled', async () => {
  const manager = new AnchorManager(store());
  manager.init({options: new WorldOptions()});
  manager.update();
  try {
    await expect(manager.create(transform(), 'chair')).resolves.toBeNull();
  } finally {
    manager.dispose();
  }
});

it('restores objects once at their saved world pose and removes scene and storage entries together', async () => {
  const first = simulated(),
    second = simulated();
  const parent = new THREE.Group();
  parent.position.set(3, 1, -2);
  const object = new THREE.Object3D();
  object.position.set(1, 2, 3);
  object.rotation.y = 0.4;
  parent.add(object);
  parent.updateMatrixWorld(true);
  const saved = object.getWorldPosition(new THREE.Vector3());
  const anchored = new AnchoredObjects(first, parent);
  try {
    await anchored.anchor(object, 'lamp');
    const scene = new THREE.Group();
    const restored = new AnchoredObjects(second, scene);
    expect(
      await restored.restore((label) => {
        const node = new THREE.Object3D();
        node.name = label;
        return node;
      })
    ).toBe(1);
    expect(await restored.restore(() => new THREE.Object3D())).toBe(0);
    restored.update();
    expect(scene.children).toHaveLength(1);
    expect(scene.children[0].name).toBe('lamp');
    expect(scene.children[0].position).toEqual(saved);
    expect(scene.children[0].rotation.y).toBeCloseTo(0.4);
    restored.remove(second.getAll()[0].id);
    expect(scene.children).toEqual([]);
    expect(store().load()).toEqual([]);
  } finally {
    first.dispose();
    second.dispose();
  }
});
