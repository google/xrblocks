import {afterEach, expect, it, vi} from 'vitest';
import {defaultAnchorStorageKey} from './AnchorsOptions';
import {LocalStorageAnchorStore} from './LocalStorageAnchorStore';
const key = 'world.anchor-storage-test';
const record = (uuid: string, createdAt = 1) => ({
  uuid,
  label: uuid,
  createdAt,
  pose: {
    position: [1, 2, 3] as [number, number, number],
    orientation: [0, 0, 0, 1] as [number, number, number, number],
  },
});
afterEach(() => {
  localStorage.removeItem(key);
  vi.restoreAllMocks();
});
it('round-trips poses and updates or removes only the selected record', () => {
  const store = new LocalStorageAnchorStore(key, 3, localStorage);
  store.save(record('a'));
  store.save(record('b'));
  const updated = {...record('a'), label: 'a "quoted" 🛋 label'};
  expect(store.save(updated)).toBe(true);
  expect(new LocalStorageAnchorStore(key, 3).load()).toEqual([
    updated,
    record('b'),
  ]);
  store.remove('a');
  expect(store.load()).toEqual([record('b')]);
  store.clear();
  expect(store.load()).toEqual([]);
});
it('evicts the oldest saved anchor only when a new record exceeds the limit', () => {
  const store = new LocalStorageAnchorStore(key, 2);
  store.save(record('a', 1));
  store.save(record('b', 2));
  store.save(record('a', 3));
  expect(
    store
      .load()
      .map(({uuid}) => uuid)
      .sort()
  ).toEqual(['a', 'b']);
  store.save(record('c', 4));
  expect(store.load().map(({uuid}) => uuid)).toEqual(['a', 'c']);
});
it.each([
  '{bad json',
  JSON.stringify([
    {
      uuid: 'bad',
      label: 'bad',
      createdAt: 1,
      pose: {position: [1, 'x'], orientation: [0, 0, 0, 1]},
    },
    record('ok'),
  ]),
])('rejects malformed stored data without losing valid records (%#)', (raw) => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  localStorage.setItem(key, raw);
  expect(new LocalStorageAnchorStore(key, 2).load()).toEqual(
    raw.startsWith('[') ? [record('ok')] : []
  );
});
it('reports a failed write and preserves the previous records', () => {
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  const store = new LocalStorageAnchorStore(key, 2);
  store.save(record('a'));
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('quota exceeded');
  });
  expect(store.save(record('b'))).toBe(false);
  expect(store.load()).toEqual([record('a')]);
});
it('isolates different pages while directory and index routes share saved anchors', () => {
  const firstKey = defaultAnchorStorageKey('/world-anchor-test/'),
    secondKey = defaultAnchorStorageKey('/another-world-anchor-test/');
  const first = new LocalStorageAnchorStore(firstKey, 2),
    second = new LocalStorageAnchorStore(secondKey, 2);
  try {
    first.save(record('a'));
    second.save(record('b'));
    expect(
      new LocalStorageAnchorStore(
        defaultAnchorStorageKey('/world-anchor-test/index.html'),
        2
      ).load()
    ).toEqual([record('a')]);
    expect(second.load()).toEqual([record('b')]);
  } finally {
    first.clear();
    second.clear();
  }
});
