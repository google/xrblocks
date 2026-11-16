import {describe, expect, it} from 'vitest';
import {compareRevision, transform} from './RoomcraftNetProtocol';

const pose = [1, 2, 3, 0, 0, 0, 1, 1, 1, 1];

describe('Roomcraft network protocol', () => {
  it('totally orders revisions without wall clocks', () => {
    expect(
      compareRevision({counter: 2, peerId: 'a'}, {counter: 1, peerId: 'z'})
    ).toBeGreaterThan(0);
    expect(
      compareRevision({counter: 1, peerId: 'b'}, {counter: 1, peerId: 'a'})
    ).toBeGreaterThan(0);
    expect(
      compareRevision({counter: 1, peerId: 'a'}, {counter: 1, peerId: 'a'})
    ).toBe(0);
  });

  it('requires finite transforms, unit quaternions, and positive scales', () => {
    expect(transform(pose)).toEqual(pose);
    expect(transform(pose)).not.toBe(pose);
    for (const invalid of [
      [],
      [...pose.slice(0, 9), 0],
      [Infinity, ...pose.slice(1)],
      [1, 2, 3, 0, 0, 0, 0, 1, 1, 1],
    ])
      expect(() => transform(invalid)).toThrow('transform');
  });
});
