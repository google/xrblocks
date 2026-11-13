import * as THREE from 'three';
import {afterEach, expect, it, vi} from 'vitest';
import {platform, store, transform} from './Anchors.test-fixture';

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
