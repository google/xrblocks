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
      return true;
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
    hasPersistentHandle?: boolean;
    canDeletePersistent?: boolean;
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
    deletePersistentAnchor:
      opts.canDeletePersistent === false ? undefined : vi.fn(async () => {}),
  } as unknown as XRSession;
  (frame as unknown as {session: XRSession}).session = session;
  return {frame, session, created};
}

const REF_SPACE = {__ref: true} as unknown as XRReferenceSpace;

function fakeRenderer(refSpace: XRReferenceSpace | null = REF_SPACE) {
  return {
    xr: {getReferenceSpace: () => refSpace, getSession: () => null},
  } as unknown as import('three').WebGLRenderer;
}

function makeManager(store = memoryStore(), renderer = fakeRenderer()) {
  const options = new WorldOptions();
  options.anchors.enablePersistence();
  const manager = new AnchorManager(store);
  manager.init({options, renderer});
  return {manager, store, options};
}

const POSE = {} as XRRigidTransform;

/**
 * Lets pending microtasks settle.
 *
 * create() reaches its retry queue only after the first attempt rejects, so a
 * synchronous update() would otherwise pump an empty queue.
 * @returns A promise resolved on the next macrotask.
 */
const tick = () => new Promise((resolve) => setTimeout(resolve, 0));

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
    const pending = manager.create(POSE, 'sofa');
    await tick();
    manager.update(1, frame); // lets the single retry settle
    await expect(pending).resolves.toBeNull();
    expect(String(manager.lastError)).toContain('boom');
  });

  it('does not poison later creates after one failure', async () => {
    const {manager} = makeManager();
    const env = fakeEnv();
    const failing = vi.fn().mockRejectedValueOnce(new Error('transient'));
    const working = vi.fn(async () => fakeAnchor('uuid-2'));
    (env.frame as unknown as {createAnchor: unknown}).createAnchor = failing;
    manager.update(0, env.frame);
    const first = manager.create(POSE, 'first');
    await tick();
    manager.update(1, env.frame);
    await first;
    (env.frame as unknown as {createAnchor: unknown}).createAnchor = working;
    manager.update(2, env.frame);
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

describe('AnchorManager reference space', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('creates anchors against the reference space, never the session', async () => {
    const {manager} = makeManager();
    const env = fakeEnv();
    manager.update(0, env.frame);
    await manager.create(POSE, 'sofa');
    const call = (env.frame.createAnchor as unknown as ReturnType<typeof vi.fn>)
      .mock.calls[0];
    expect(call[1]).toBe(REF_SPACE);
    expect(call[1]).not.toBe(env.session);
  });

  it('prefers an explicitly supplied space', async () => {
    const {manager} = makeManager();
    const env = fakeEnv();
    const custom = {__custom: true} as unknown as XRSpace;
    manager.update(0, env.frame);
    await manager.create(POSE, 'sofa', custom);
    const call = (env.frame.createAnchor as unknown as ReturnType<typeof vi.fn>)
      .mock.calls[0];
    expect(call[1]).toBe(custom);
  });

  it('refuses to create without a reference space rather than guessing', async () => {
    const {manager} = makeManager(memoryStore(), fakeRenderer(null));
    const env = fakeEnv();
    manager.update(0, env.frame);
    await expect(manager.create(POSE, 'sofa')).resolves.toBeNull();
  });
});

describe('AnchorManager restore idempotency', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('does not duplicate anchors when restoreAll runs twice', async () => {
    const store = memoryStore([{uuid: 'a', label: 'sofa', createdAt: 1}]);
    const {manager} = makeManager(store);
    const {frame} = fakeEnv();
    manager.update(0, frame);
    await manager.restoreAll();
    await manager.restoreAll();
    expect(manager.getAll()).toHaveLength(1);
  });

  it('reports an already-restored record as restored', async () => {
    const store = memoryStore([{uuid: 'a', label: 'sofa', createdAt: 1}]);
    const {manager} = makeManager(store);
    const {frame} = fakeEnv();
    manager.update(0, frame);
    await manager.restoreAll();
    const second = await manager.restoreAll();
    expect(second.map((r) => r.status)).toEqual(['restored']);
  });

  it('hands back the tracked anchor so callers need not rescan', async () => {
    const store = memoryStore([{uuid: 'a', label: 'sofa', createdAt: 1}]);
    const {manager} = makeManager(store);
    const {frame} = fakeEnv();
    manager.update(0, frame);
    const [result] = await manager.restoreAll();
    expect(result.anchor).toBeDefined();
    expect(result.anchor!.label).toBe('sofa');
    expect(manager.getAll()[0].id).toBe(result.anchor!.id);
  });
});

describe('AnchorManager.getPose', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('returns null instead of throwing on a stale frame', async () => {
    const {manager} = makeManager();
    const env = fakeEnv();
    manager.update(0, env.frame);
    const tracked = await manager.create(POSE, 'sofa');
    (env.frame as unknown as {getPose: unknown}).getPose = () => {
      throw new Error('InvalidStateError');
    };
    expect(() => manager.getPose(tracked!.id, REF_SPACE)).not.toThrow();
    expect(manager.getPose(tracked!.id, REF_SPACE)).toBeNull();
  });

  it('returns null for an unknown id', () => {
    const {manager} = makeManager();
    manager.update(0, fakeEnv().frame);
    expect(manager.getPose('missing', REF_SPACE)).toBeNull();
  });
});

describe('AnchorManager.getPose reference space default', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('falls back to the renderer reference space when none is given', async () => {
    const {manager} = makeManager();
    const env = fakeEnv();
    const getPose = vi.fn(() => ({transform: {}}) as unknown as XRPose);
    (env.frame as unknown as {getPose: unknown}).getPose = getPose;
    manager.update(0, env.frame);
    const tracked = await manager.create(POSE, 'sofa');
    // Callers should not have to thread the reference space through
    // themselves when the manager already holds the renderer.
    manager.getPose(tracked!.id);
    expect(getPose.mock.calls[0][1]).toBe(REF_SPACE);
  });

  it('still honours an explicitly supplied reference space', async () => {
    const {manager} = makeManager();
    const env = fakeEnv();
    const getPose = vi.fn(() => ({transform: {}}) as unknown as XRPose);
    (env.frame as unknown as {getPose: unknown}).getPose = getPose;
    manager.update(0, env.frame);
    const tracked = await manager.create(POSE, 'sofa');
    const custom = {__other: true} as unknown as XRReferenceSpace;
    manager.getPose(tracked!.id, custom);
    expect(getPose.mock.calls[0][1]).toBe(custom);
  });
});

describe('AnchorManager frame validity', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('retries on the next live frame when the cached frame is inactive', async () => {
    // Apps create anchors from DOM handlers, which fire after the cached frame
    // has gone inactive and createAnchor starts rejecting.
    const {manager} = makeManager();
    const stale = fakeEnv();
    (stale.frame as unknown as {createAnchor: unknown}).createAnchor = vi
      .fn()
      .mockRejectedValue(new Error('InvalidStateError'));
    manager.update(0, stale.frame);

    const pending = manager.create(POSE, 'sofa');
    await tick();
    const live = fakeEnv();
    manager.update(1, live.frame);
    const tracked = await pending;

    expect(tracked).not.toBeNull();
    expect(live.frame.createAnchor).toHaveBeenCalled();
  });

  it('resolves retried creations in the order they were requested', async () => {
    const {manager} = makeManager();
    const stale = fakeEnv();
    (stale.frame as unknown as {createAnchor: unknown}).createAnchor = vi
      .fn()
      .mockRejectedValue(new Error('InvalidStateError'));
    manager.update(0, stale.frame);
    const a = manager.create(POSE, 'first');
    const b = manager.create(POSE, 'second');
    await tick();
    const live = fakeEnv();
    manager.update(1, live.frame);
    const [ra, rb] = await Promise.all([a, b]);
    expect([ra.label, rb.label]).toEqual(['first', 'second']);
  });

  it('fails retried creations when the session ends first', async () => {
    const {manager} = makeManager();
    const stale = fakeEnv();
    (stale.frame as unknown as {createAnchor: unknown}).createAnchor = vi
      .fn()
      .mockRejectedValue(new Error('InvalidStateError'));
    manager.update(0, stale.frame);
    const pending = manager.create(POSE, 'sofa');
    await tick();
    manager.onSessionEnded();
    await expect(pending).resolves.toBeNull();
  });
});

describe('AnchorManager session end', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('drops anchors from the ended session but keeps saved records', async () => {
    const store = memoryStore();
    const {manager} = makeManager(store);
    const env = fakeEnv({persistentUuid: 'uuid-keep'});
    manager.update(0, env.frame);
    const tracked = await manager.create(POSE, 'sofa');
    await manager.persist(tracked.id);

    manager.onSessionEnded();

    expect(manager.getAll()).toHaveLength(0);
    expect(store.load()).toHaveLength(1);
  });

  it('restores into the new session rather than reusing dead anchors', async () => {
    const store = memoryStore([{uuid: 'a', label: 'sofa', createdAt: 1}]);
    const {manager} = makeManager(store);
    const env = fakeEnv();
    manager.update(0, env.frame);
    await manager.restoreAll();
    manager.onSessionEnded();

    const next = fakeEnv();
    manager.update(2, next.frame);
    const results = await manager.restoreAll();
    expect(results.map((r) => r.status)).toEqual(['restored']);
    expect(next.session.restorePersistentAnchor).toHaveBeenCalled();
  });
});

describe('AnchorManager persistent handle cleanup', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  /**
   * Creates and persists one anchor against a live frame.
   * @returns The manager, session and the tracked anchor's id.
   */
  async function persistOne() {
    const {manager, store} = makeManager();
    const env = fakeEnv({persistentUuid: 'uuid-keep'});
    manager.update(0, env.frame);
    const tracked = await manager.create(POSE, 'thing');
    await manager.persist(tracked!.id);
    return {manager, store, session: env.session, id: tracked!.id};
  }

  it('releases the platform handle when an anchor is deleted', async () => {
    const {manager, session, id} = await persistOne();
    manager.delete(id);
    // Dropping only our own record leaves the handle allocated on the
    // headset forever, and the platform caps how many may exist.
    expect(session.deletePersistentAnchor).toHaveBeenCalledWith('uuid-keep');
  });

  it('releases every platform handle when everything is forgotten', async () => {
    const {manager, session} = await persistOne();
    manager.forgetAll();
    expect(session.deletePersistentAnchor).toHaveBeenCalledWith('uuid-keep');
  });

  it('releases handles for records that were never restored', async () => {
    const store = memoryStore([{uuid: 'uuid-old', label: 'old', createdAt: 1}]);
    const {manager} = makeManager(store);
    const env = fakeEnv();
    manager.update(0, env.frame);
    manager.forgetAll();
    expect(env.session.deletePersistentAnchor).toHaveBeenCalledWith('uuid-old');
  });

  it('still forgets records when the platform cannot delete handles', async () => {
    const store = memoryStore([{uuid: 'uuid-old', label: 'old', createdAt: 1}]);
    const {manager} = makeManager(store);
    manager.update(0, fakeEnv({canDeletePersistent: false}).frame);
    expect(() => manager.forgetAll()).not.toThrow();
    expect(store.records).toEqual([]);
  });

  it('survives a rejected handle deletion', async () => {
    const {manager, store, session, id} = await persistOne();
    (
      session.deletePersistentAnchor as ReturnType<typeof vi.fn>
    ).mockRejectedValue(new Error('nope'));
    expect(() => manager.delete(id)).not.toThrow();
    await tick();
    expect(store.records).toEqual([]);
  });
});

describe('AnchorManager eviction cleanup', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  /**
   * A store that keeps at most one record, evicting the older one.
   * @returns The capped store.
   */
  function cappedStore() {
    const records: AnchorRecord[] = [];
    return {
      records,
      load: () => [...records],
      save: (r: AnchorRecord) => {
        records.push(r);
        while (records.length > 1) records.shift();
        return true;
      },
      remove: () => {},
      clear: () => void records.splice(0, records.length),
    };
  }

  it('releases the handle of a record pushed out by the cap', async () => {
    const store = cappedStore();
    const {manager} = makeManager(store);
    const env = fakeEnv();
    (
      env.frame.createAnchor as unknown as ReturnType<typeof vi.fn>
    ).mockImplementation(async () =>
      fakeAnchor(`uuid-${store.records.length}`)
    );
    manager.update(0, env.frame);

    const a = await manager.create(POSE, 'first');
    await manager.persist(a!.id);
    const b = await manager.create(POSE, 'second');
    await manager.persist(b!.id);

    // The store silently dropped uuid-0, so nothing else will ever name it.
    expect(env.session.deletePersistentAnchor).toHaveBeenCalledWith('uuid-0');
  });

  it('does not release the handle it just saved', async () => {
    const store = cappedStore();
    const {manager} = makeManager(store);
    const env = fakeEnv({persistentUuid: 'uuid-only'});
    manager.update(0, env.frame);
    const a = await manager.create(POSE, 'first');
    await manager.persist(a!.id);
    expect(env.session.deletePersistentAnchor).not.toHaveBeenCalled();
  });
});

describe('AnchorManager platform handles', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('lists the handles the platform is holding', () => {
    const {manager} = makeManager();
    const env = fakeEnv();
    (
      env.session as unknown as {persistentAnchors: string[]}
    ).persistentAnchors = ['uuid-a', 'uuid-b'];
    manager.update(0, env.frame);
    expect(manager.platformHandles()).toEqual(['uuid-a', 'uuid-b']);
  });

  it('reports nothing when the platform does not expose the list', () => {
    const {manager} = makeManager();
    manager.update(0, fakeEnv().frame);
    // Chrome implements anchors without persistence, so this is absent there
    // rather than empty, and must not look like "the platform holds none".
    expect(manager.platformHandles()).toEqual([]);
  });

  it('reports nothing before a session exists', () => {
    const {manager} = makeManager();
    expect(manager.platformHandles()).toEqual([]);
  });

  it('finds handles that no saved record names any more', () => {
    const store = memoryStore([{uuid: 'uuid-a', label: 'kept', createdAt: 1}]);
    const {manager} = makeManager(store);
    const env = fakeEnv();
    (
      env.session as unknown as {persistentAnchors: string[]}
    ).persistentAnchors = ['uuid-a', 'uuid-orphan'];
    manager.update(0, env.frame);
    // Clearing site data strands handles: the platform still holds them but
    // nothing left on our side can name them.
    expect(manager.orphanedHandles()).toEqual(['uuid-orphan']);
  });
});

describe('AnchorManager simulated handles', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  /**
   * A manager with the desktop fallback active.
   * @param store - Store to back it with.
   * @returns The manager.
   */
  function simulated(store: ReturnType<typeof memoryStore>) {
    const options = new WorldOptions();
    options.anchors.enablePersistence();
    options.anchors.simulatorFallback = true;
    const manager = new AnchorManager(store);
    manager.init({options, renderer: fakeRenderer()});
    manager.update(0, undefined);
    return manager;
  }

  it('does not overwrite a record that happens to match the next id', async () => {
    // A page reload restarts the id counter, so a fresh anchor can be handed
    // an id a previously saved record already used as its handle. Seeding the
    // store with the id this manager is about to mint reproduces that without
    // depending on the counter's current value.
    const store = memoryStore();
    const manager = simulated(store);
    const probe = await manager.create(POSE, 'probe');
    const nextId = `anchor-${Number(probe!.id.split('-')[1]) + 1}`;
    store.records.push({
      uuid: nextId,
      label: 'saved earlier',
      createdAt: 1,
      pose: {position: [1, 0, 0], orientation: [0, 0, 0, 1]},
    });

    const tracked = await manager.create(POSE, 'new one');
    expect(tracked!.id).toBe(nextId);
    await manager.persist(tracked!.id);

    expect(store.records.map((r) => r.label)).toContain('saved earlier');
    expect(store.records).toHaveLength(2);
  });

  it('gives every simulated anchor its own handle', async () => {
    const store = memoryStore();
    const manager = simulated(store);
    const a = await manager.create(POSE, 'a');
    const b = await manager.create(POSE, 'b');
    await manager.persist(a!.id);
    await manager.persist(b!.id);
    const uuids = store.records.map((r) => r.uuid);
    expect(new Set(uuids).size).toBe(2);
  });

  it('keeps a handle stable across repeated saves', async () => {
    const store = memoryStore();
    const manager = simulated(store);
    const a = await manager.create(POSE, 'a');
    await manager.persist(a!.id);
    const first = store.records[0].uuid;
    await manager.persist(a!.id);
    expect(store.records).toHaveLength(1);
    expect(store.records[0].uuid).toBe(first);
  });
});

describe('AnchorManager uses the handle the platform minted', () => {
  beforeEach(() => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  it('saves each anchor under the handle the platform minted', async () => {
    const store = memoryStore();
    const {manager} = makeManager(store);
    const env = fakeEnv();
    let n = 0;
    (
      env.frame.createAnchor as unknown as ReturnType<typeof vi.fn>
    ).mockImplementation(async () => fakeAnchor(`platform-uuid-${n++}`));
    manager.update(0, env.frame);

    const a = await manager.create(POSE, 'a');
    const b = await manager.create(POSE, 'b');
    await manager.persist(a!.id);
    await manager.persist(b!.id);

    // Never the session-local id, which restarts on reload and would collide.
    expect(store.records.map((r) => r.uuid)).toEqual([
      'platform-uuid-0',
      'platform-uuid-1',
    ]);
  });

  it('updates one record when the same anchor is saved twice', async () => {
    const store = memoryStore();
    const {manager} = makeManager(store);
    const env = fakeEnv({persistentUuid: 'stable-handle'});
    manager.update(0, env.frame);
    const a = await manager.create(POSE, 'a');
    await manager.persist(a!.id);
    await manager.persist(a!.id);
    expect(store.records).toHaveLength(1);
  });
});
