import {describe, expect, it} from 'vitest';
import {
  compareRevision,
  objectStates,
  revision,
  transform,
} from './RoomcraftNetProtocol';

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

  it.each([-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER])(
    'rejects invalid sequence %s',
    (counter) => {
      expect(() => revision({counter, peerId: 'peer'})).toThrow();
    }
  );

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

  it('requires exactly one state per scene object', () => {
    const state = {id: 'chair', ownerId: '', xform: pose};
    expect(objectStates([state], ['chair'])).toEqual([state]);
    expect(() => objectStates([state, state], ['chair', 'lamp'])).toThrow();
    expect(() => objectStates([], ['chair'])).toThrow();
    expect(() =>
      objectStates([{...state, ownerId: null}], ['chair'])
    ).toThrow();
  });

  it('preserves released claim metadata and rejects mismatched or invalid claims', () => {
    const state = {
      id: 'chair',
      ownerId: '',
      xform: pose,
      claim: {counter: 3, peerId: 'a'},
    };
    const parsed = objectStates([state], ['chair']);
    expect(parsed).toEqual([state]);
    expect(parsed[0].claim).not.toBe(state.claim);
    expect(() => objectStates([{...state, ownerId: 'b'}], ['chair'])).toThrow(
      'claim'
    );
    expect(() =>
      objectStates([{...state, claim: {counter: 0, peerId: 'a'}}], ['chair'])
    ).toThrow('claim');
  });
});
