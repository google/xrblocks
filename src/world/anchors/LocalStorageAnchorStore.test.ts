import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';

import {LocalStorageAnchorStore} from './LocalStorageAnchorStore';
import {AnchorRecord} from './AnchorTypes';

const KEY = 'test.anchors';

function record(uuid: string, label = uuid, createdAt = 1000): AnchorRecord {
  return {uuid, label, createdAt};
}

/** Minimal in-memory stand-in for the Storage interface. */
function fakeStorage() {
  const map = new Map<string, string>();
  return {
    getItem: (k: string) => (map.has(k) ? map.get(k)! : null),
    setItem: (k: string, v: string) => void map.set(k, v),
    removeItem: (k: string) => void map.delete(k),
    _map: map,
  };
}

let storage: ReturnType<typeof fakeStorage>;

beforeEach(() => {
  storage = fakeStorage();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('LocalStorageAnchorStore', () => {
  it('round-trips a saved record', () => {
    const store = new LocalStorageAnchorStore(KEY, 128, storage);
    store.save(record('a'));
    expect(store.load()).toEqual([record('a')]);
  });

  it('returns an empty array when nothing is stored', () => {
    expect(new LocalStorageAnchorStore(KEY, 128, storage).load()).toEqual([]);
  });

  it('returns an empty array and warns on malformed json', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    storage.setItem(KEY, '{not json');
    expect(new LocalStorageAnchorStore(KEY, 128, storage).load()).toEqual([]);
    expect(warn).toHaveBeenCalled();
  });

  it('ignores stored json that is not an array', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    storage.setItem(KEY, '{"uuid":"a"}');
    expect(new LocalStorageAnchorStore(KEY, 128, storage).load()).toEqual([]);
  });

  it('drops entries missing a uuid rather than returning them', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    storage.setItem(KEY, JSON.stringify([{label: 'x'}, record('a')]));
    expect(new LocalStorageAnchorStore(KEY, 128, storage).load()).toEqual([
      record('a'),
    ]);
  });

  it('replaces the existing entry for a uuid instead of duplicating it', () => {
    const store = new LocalStorageAnchorStore(KEY, 128, storage);
    store.save(record('a', 'first'));
    store.save(record('a', 'second'));
    const loaded = store.load();
    expect(loaded).toHaveLength(1);
    expect(loaded[0].label).toBe('second');
  });

  it('removes one record without touching its siblings', () => {
    const store = new LocalStorageAnchorStore(KEY, 128, storage);
    store.save(record('a'));
    store.save(record('b'));
    store.remove('a');
    expect(store.load().map((r) => r.uuid)).toEqual(['b']);
  });

  it('removing an unknown uuid is a no-op', () => {
    const store = new LocalStorageAnchorStore(KEY, 128, storage);
    store.save(record('a'));
    store.remove('nope');
    expect(store.load().map((r) => r.uuid)).toEqual(['a']);
  });

  it('clear removes everything', () => {
    const store = new LocalStorageAnchorStore(KEY, 128, storage);
    store.save(record('a'));
    store.clear();
    expect(store.load()).toEqual([]);
  });

  it('evicts the oldest record once the cap is reached', () => {
    const store = new LocalStorageAnchorStore(KEY, 2, storage);
    store.save(record('a', 'a', 1));
    store.save(record('b', 'b', 2));
    store.save(record('c', 'c', 3));
    expect(store.load().map((r) => r.uuid)).toEqual(['b', 'c']);
  });

  it('re-saving an existing uuid does not trigger eviction', () => {
    const store = new LocalStorageAnchorStore(KEY, 2, storage);
    store.save(record('a', 'a', 1));
    store.save(record('b', 'b', 2));
    store.save(record('a', 'updated', 3));
    expect(
      store
        .load()
        .map((r) => r.uuid)
        .sort()
    ).toEqual(['a', 'b']);
  });

  it('survives storage being explicitly disabled', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store = new LocalStorageAnchorStore(KEY, 128, null);
    expect(() => store.save(record('a'))).not.toThrow();
    expect(store.load()).toEqual([]);
  });

  it('falls back to real storage when none is given', () => {
    // Omitting the argument must reach localStorage rather than silently
    // disabling persistence, which is the difference null now expresses.
    const store = new LocalStorageAnchorStore('omitted.key', 128);
    store.save(record('a'));
    expect(store.load().map((r) => r.uuid)).toEqual(['a']);
    store.clear();
  });

  it('survives a storage quota error on write', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const throwing = {
      ...storage,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    const store = new LocalStorageAnchorStore(KEY, 128, throwing);
    expect(() => store.save(record('a'))).not.toThrow();
    expect(warn).toHaveBeenCalled();
  });

  it('preserves labels containing quotes and unicode', () => {
    const store = new LocalStorageAnchorStore(KEY, 128, storage);
    const tricky = record('a', 'a "quoted" label with 🛋 and \\ backslash');
    store.save(tricky);
    expect(store.load()[0].label).toBe(tricky.label);
  });

  it('scopes writes to the configured key', () => {
    const store = new LocalStorageAnchorStore('custom.key', 128, storage);
    store.save(record('a'));
    expect(storage.getItem('custom.key')).toBeTruthy();
    expect(storage.getItem(KEY)).toBeNull();
  });
});

describe('LocalStorageAnchorStore write reporting', () => {
  it('reports success when the record is committed', () => {
    const store = new LocalStorageAnchorStore(KEY, 128, storage);
    expect(store.save(record('a'))).toBe(true);
  });

  it('reports failure when storage is disabled', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const store = new LocalStorageAnchorStore(KEY, 128, null);
    // Reporting success here would let an app tell a user their anchor was
    // saved when nothing was written.
    expect(store.save(record('a'))).toBe(false);
  });

  it('reports failure when the write throws', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const throwing = {
      ...storage,
      setItem: () => {
        throw new Error('QuotaExceededError');
      },
    };
    expect(
      new LocalStorageAnchorStore(KEY, 128, throwing).save(record('a'))
    ).toBe(false);
  });
});

describe('LocalStorageAnchorStore pose validation', () => {
  it('drops records whose pose is malformed', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    storage.setItem(
      KEY,
      JSON.stringify([
        {uuid: 'bad', label: 'bad', createdAt: 1, pose: {position: [1, 2]}},
        {uuid: 'ok', label: 'ok', createdAt: 2},
      ])
    );
    expect(
      new LocalStorageAnchorStore(KEY, 128, storage).load().map((r) => r.uuid)
    ).toEqual(['ok']);
  });

  it('keeps records with a well formed pose', () => {
    storage.setItem(
      KEY,
      JSON.stringify([
        {
          uuid: 'ok',
          label: 'ok',
          createdAt: 1,
          pose: {position: [1, 2, 3], orientation: [0, 0, 0, 1]},
        },
      ])
    );
    expect(
      new LocalStorageAnchorStore(KEY, 128, storage).load()[0].pose?.position
    ).toEqual([1, 2, 3]);
  });

  it('drops a pose containing non-numbers', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    storage.setItem(
      KEY,
      JSON.stringify([
        {
          uuid: 'bad',
          label: 'bad',
          createdAt: 1,
          pose: {position: [1, 'x', 3], orientation: [0, 0, 0, 1]},
        },
      ])
    );
    expect(new LocalStorageAnchorStore(KEY, 128, storage).load()).toEqual([]);
  });
});
