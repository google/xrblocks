import {beforeEach, describe, expect, it, vi, afterEach} from 'vitest';

import {WorldOptions} from '../WorldOptions';

import {AnchorManager} from './AnchorManager';
import {AnchorStore} from './AnchorStore';
import {AnchorRecord} from './AnchorTypes';

/** In-memory store so persistence can be asserted without a browser. */
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

/** A fake XRAnchor whose persistent handle can be made to succeed or fail. */
function fakeAnchor(uuid?: string) {
  return {
    anchorSpace: {},
    delete: vi.fn(),
    requestPersistentHandle: uuid ? vi.fn().mockResolvedValue(uuid) : undefined,
  };
}

interface FakeEnv {
  frame: XRFrame;
  session: XRSession;
  created: ReturnType<typeof fakeAnchor>[];
}

/**
 * Builds a fake frame/session pair.
 * @param opts - Which optional anchor APIs the fake platform exposes.
 * @returns The fake environment.
 */
function fakeEnv(
  opts: {
    canCreate?: boolean;
    canRestore?: boolean;
    persistentUuid?: string;
    restoreImpl?: (uuid: string) => Promise<unknown>;
    trackedAnchors?: Set<unknown>;
  } = {}
): FakeEnv {
  const {
    canCreate = true,
    canRestore = true,
    hasPersistentHandle = true,
    persistentUuid = 'uuid-1',
    restoreImpl,
  } = opts;
  const created: ReturnType<typeof fakeAnchor>[] = [];
  const frame = {
    createAnchor: canCreate
      ? vi.fn(async () => {
          const a = fakeAnchor(
            hasPersistentHandle ? persistentUuid : undefined
          );
          created.push(a);
          return a;
        })
      : undefined,
    trackedAnchors: opts.trackedAnchors,
    getPose: vi.fn(() => null),
  } as unknown as XRFrame;
  const session = {
    restorePersistentAnchor: canRestore
      ? vi.fn(restoreImpl ?? (async () => fakeAnchor()))
      : undefined,
  } as unknown as XRSession;
  (frame as unknown as {session: XRSession}).session = session;
  return {frame, session, created};
}

function makeManager(store = memoryStore()) {
  const options = new WorldOptions();
  options.anchors.enablePersistence();
  const manager = new AnchorManager(store);
  manager.init({options});
  return {manager, store, options};
}

const POSE = {} as XRRigidTransform;

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AnchorManager capability', () => {
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('starts unsupported before any frame is seen', () => {
    const {manager} = makeManager();
    expect(manager.capability).toBe('unsupported');
  });

  it('becomes persistent once a capable frame is seen', () => {
    const {manager} = makeManager();
    const {frame} = fakeEnv();
    manager.update(0, frame);
    expect(manager.capability).toBe('persistent');
  });

  it('becomes session-only when the session cannot restore', () => {
    const {manager} = makeManager();
    const {frame} = fakeEnv({canRestore: false});
    manager.update(0, frame);
    expect(manager.capability).toBe('session-only');
  });

  it('warns at most once about an unsupported platform', () => {
    const {manager} = makeManager();
    const {frame} = fakeEnv({canCreate: false});
    manager.update(0, frame);
    manager.update(1, frame);
    manager.update(2, frame);
    const unsupported = warn.mock.calls.filter((c) =>
      String(c[0]).includes('anchors')
    );
    expect(unsupported.length).toBeLessThanOrEqual(1);
  });
});

describe('AnchorManager.create', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('returns null when the platform cannot create anchors', async () => {
    const {manager} = makeManager();
    const {frame} = fakeEnv({canCreate: false});
    manager.update(0, frame);
    await expect(manager.create(POSE, 'sofa')).resolves.toBeNull();
  });

  it('returns null rather than throwing when no frame has been seen', async () => {
    const {manager} = makeManager();
    await expect(manager.create(POSE, 'sofa')).resolves.toBeNull();
  });

  it('creates and tracks an anchor', async () => {
    const {manager} = makeManager();
    const {frame} = fakeEnv();
    manager.update(0, frame);
    const tracked = await manager.create(POSE, 'sofa');
    expect(tracked).not.toBeNull();
    expect(tracked!.label).toBe('sofa');
    expect(manager.getAll()).toHaveLength(1);
  });

  it('records the error and returns null when creation rejects', async () => {
    const {manager} = makeManager();
    const {frame} = fakeEnv();
    (frame.createAnchor as unknown as ReturnType<typeof vi.fn>) = vi
      .fn()
      .mockRejectedValue(new Error('boom'));
    manager.update(0, frame);
    await expect(manager.create(POSE, 'sofa')).resolves.toBeNull();
    expect(String(manager.lastError)).toContain('boom');
  });

  it('does not poison later creates after one failure', async () => {
    const {manager} = makeManager();
    const env = fakeEnv();
    const failing = vi.fn().mockRejectedValueOnce(new Error('transient'));
    const working = vi.fn(async () => fakeAnchor('uuid-2'));
    (env.frame as unknown as {createAnchor: unknown}).createAnchor = failing;
    manager.update(0, env.frame);
    await manager.create(POSE, 'first');
    (env.frame as unknown as {createAnchor: unknown}).createAnchor = working;
    manager.update(1, env.frame);
    await expect(manager.create(POSE, 'second')).resolves.not.toBeNull();
  });

  it('gives each anchor a distinct id', async () => {
    const {manager} = makeManager();
    const {frame} = fakeEnv();
    manager.update(0, frame);
    const a = await manager.create(POSE, 'a');
    const b = await manager.create(POSE, 'b');
    expect(a!.id).not.toBe(b!.id);
  });
});

describe('AnchorManager persistence', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('saves a handle when the platform supports persistence', async () => {
    const {manager, store} = makeManager();
    const {frame} = fakeEnv({persistentUuid: 'uuid-abc'});
    manager.update(0, frame);
    const tracked = await manager.create(POSE, 'lamp');
    await expect(manager.persist(tracked!.id)).resolves.toBe(true);
    expect(store.load().map((r) => r.uuid)).toEqual(['uuid-abc']);
    expect(store.load()[0].label).toBe('lamp');
  });

  it('does not save when the platform is session-only', async () => {
    const {manager, store} = makeManager();
    const {frame} = fakeEnv({canRestore: false});
    manager.update(0, frame);
    const tracked = await manager.create(POSE, 'lamp');
    await expect(manager.persist(tracked!.id)).resolves.toBe(false);
    expect(store.load()).toEqual([]);
  });

  it('does not save when the anchor has no persistent handle api', async () => {
    const {manager, store} = makeManager();
    const {frame} = fakeEnv({hasPersistentHandle: false});
    manager.update(0, frame);
    const tracked = await manager.create(POSE, 'lamp');
    await expect(manager.persist(tracked!.id)).resolves.toBe(false);
    expect(store.load()).toEqual([]);
  });

  it('returns false for an unknown id', async () => {
    const {manager} = makeManager();
    const {frame} = fakeEnv();
    manager.update(0, frame);
    await expect(manager.persist('missing')).resolves.toBe(false);
  });

  it('records the error when requesting a handle rejects', async () => {
    const {manager} = makeManager();
    const {frame} = fakeEnv();
    manager.update(0, frame);
    const tracked = await manager.create(POSE, 'lamp');
    (
      tracked!.anchor as unknown as {requestPersistentHandle: unknown}
    ).requestPersistentHandle = vi.fn().mockRejectedValue(new Error('nope'));
    await expect(manager.persist(tracked!.id)).resolves.toBe(false);
    expect(String(manager.lastError)).toContain('nope');
  });
});

describe('AnchorManager.restoreAll', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('reports unsupported without touching the store', async () => {
    const store = memoryStore([{uuid: 'a', label: 'a', createdAt: 1}]);
    const {manager} = makeManager(store);
    const {frame} = fakeEnv({canRestore: false});
    manager.update(0, frame);
    const results = await manager.restoreAll();
    expect(results.map((r) => r.status)).toEqual(['unsupported']);
    expect(store.load()).toHaveLength(1);
  });

  it('restores a saved handle', async () => {
    const store = memoryStore([{uuid: 'a', label: 'sofa', createdAt: 1}]);
    const {manager} = makeManager(store);
    const {frame} = fakeEnv();
    manager.update(0, frame);
    const results = await manager.restoreAll();
    expect(results.map((r) => r.status)).toEqual(['restored']);
    expect(manager.getAll()).toHaveLength(1);
    expect(manager.getAll()[0].label).toBe('sofa');
  });

  it('reports not-found when the platform rejects the handle', async () => {
    const store = memoryStore([{uuid: 'a', label: 'a', createdAt: 1}]);
    const {manager} = makeManager(store);
    const {frame} = fakeEnv({
      restoreImpl: async () => {
        throw new Error('cannot localise');
      },
    });
    manager.update(0, frame);
    const results = await manager.restoreAll();
    expect(results.map((r) => r.status)).toEqual(['not-found']);
  });

  it('keeps restoring after one handle fails', async () => {
    const store = memoryStore([
      {uuid: 'a', label: 'a', createdAt: 1},
      {uuid: 'bad', label: 'bad', createdAt: 2},
      {uuid: 'c', label: 'c', createdAt: 3},
    ]);
    const {manager} = makeManager(store);
    const {frame} = fakeEnv({
      restoreImpl: async (uuid: string) => {
        if (uuid === 'bad') throw new Error('cannot localise');
        return fakeAnchor();
      },
    });
    manager.update(0, frame);
    const results = await manager.restoreAll();
    expect(results.map((r) => r.status)).toEqual([
      'restored',
      'not-found',
      'restored',
    ]);
    expect(manager.getAll()).toHaveLength(2);
  });

  it('preserves record order in the results', async () => {
    const store = memoryStore(
      Array.from({length: 12}, (_, i) => ({
        uuid: `u${i}`,
        label: `l${i}`,
        createdAt: i,
      }))
    );
    const {manager} = makeManager(store);
    const {frame} = fakeEnv({
      restoreImpl: async (uuid: string) => {
        if (uuid.endsWith('3')) throw new Error('nope');
        return fakeAnchor();
      },
    });
    manager.update(0, frame);
    const results = await manager.restoreAll();
    expect(results.map((r) => r.record.uuid)).toEqual(
      Array.from({length: 12}, (_, i) => `u${i}`)
    );
    expect(results[3].status).toBe('not-found');
  });

  it('returns an empty list when nothing is stored', async () => {
    const {manager} = makeManager();
    const {frame} = fakeEnv();
    manager.update(0, frame);
    await expect(manager.restoreAll()).resolves.toEqual([]);
  });
});

describe('AnchorManager lifecycle', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('delete removes the anchor and releases it', async () => {
    const {manager} = makeManager();
    const {frame} = fakeEnv();
    manager.update(0, frame);
    const tracked = await manager.create(POSE, 'sofa');
    manager.delete(tracked!.id);
    expect(manager.getAll()).toHaveLength(0);
    expect(tracked!.anchor.delete).toHaveBeenCalled();
  });

  it('delete also forgets the stored handle', async () => {
    const {manager, store} = makeManager();
    const {frame} = fakeEnv({persistentUuid: 'uuid-x'});
    manager.update(0, frame);
    const tracked = await manager.create(POSE, 'sofa');
    await manager.persist(tracked!.id);
    manager.delete(tracked!.id);
    expect(store.load()).toEqual([]);
  });

  it('drops anchors the platform has stopped tracking', async () => {
    const {manager} = makeManager();
    const env = fakeEnv();
    manager.update(0, env.frame);
    const tracked = await manager.create(POSE, 'sofa');
    (env.frame as unknown as {trackedAnchors: unknown}).trackedAnchors =
      new Set();
    manager.update(1, env.frame);
    expect(manager.getAll()).toHaveLength(0);
    expect(tracked).not.toBeNull();
  });

  it('keeps anchors when the platform does not report tracked anchors', async () => {
    const {manager} = makeManager();
    const env = fakeEnv();
    manager.update(0, env.frame);
    await manager.create(POSE, 'sofa');
    (env.frame as unknown as {trackedAnchors: unknown}).trackedAnchors =
      undefined;
    manager.update(1, env.frame);
    expect(manager.getAll()).toHaveLength(1);
  });

  it('dispose clears tracked anchors without clearing storage', async () => {
    const {manager, store} = makeManager();
    const {frame} = fakeEnv({persistentUuid: 'uuid-y'});
    manager.update(0, frame);
    const tracked = await manager.create(POSE, 'sofa');
    await manager.persist(tracked!.id);
    manager.dispose();
    expect(manager.getAll()).toHaveLength(0);
    expect(store.load()).toHaveLength(1);
  });

  it('forget clears saved handles', async () => {
    const {manager, store} = makeManager();
    const {frame} = fakeEnv({persistentUuid: 'uuid-z'});
    manager.update(0, frame);
    const tracked = await manager.create(POSE, 'sofa');
    await manager.persist(tracked!.id);
    manager.forgetAll();
    expect(store.load()).toEqual([]);
  });
});
