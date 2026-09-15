import {describe, it, expect} from 'vitest';

import {NetObject} from './NetObject';
import {NetObjectRegistry} from './NetObjectRegistry';

describe('NetObjectRegistry', () => {
  describe('applyClaim', () => {
    it('grants ownership unconditionally — explicit grabs preempt', () => {
      const reg = new NetObjectRegistry();
      const obj = new NetObject({id: 'cube-1', ownerId: 'peer-A'});
      reg.add(obj);
      expect(reg.applyClaim('cube-1', 'peer-B')).toBe(true);
      expect(obj.ownerId).toBe('peer-B');
    });

    it.each([
      ['a', 'b'],
      ['b', 'a'],
    ])(
      'resolves crossed claims deterministically (%s then %s), not by arrival order',
      (first, second) => {
        const reg = new NetObjectRegistry();
        const obj = new NetObject({id: 'cube'});
        reg.add(obj);
        reg.applyClaim('cube', first, 1);
        reg.applyClaim('cube', second, 1);
        expect(obj.ownerId).toBe('a');
        expect(reg.applyClaim('cube', 'b', 2)).toBe(true);
        expect(obj.ownerId).toBe('b');
        expect(reg.applyClaim('cube', 'a', 1)).toBe(false);
        expect(obj.ownerId).toBe('b');
      }
    );

    it('rejects stale releases and does not resurrect a released claim', () => {
      const reg = new NetObjectRegistry();
      const obj = new NetObject({id: 'cube'});
      reg.add(obj);
      reg.applyClaim('cube', 'a', 1);
      reg.applyClaim('cube', 'a', 2);
      expect(reg.applyRelease('cube', 'a', 1)).toBe(false);
      expect(obj.ownerId).toBe('a');
      expect(reg.applyRelease('cube', 'a', 2)).toBe(true);
      expect(reg.applyClaim('cube', 'a', 2)).toBe(false);
      expect(obj.ownerId).toBe('');
      expect(reg.applyClaim('cube', 'b', 3)).toBe(true);
    });
  });

  describe('applyRelease', () => {
    it('only the current owner may release', () => {
      const reg = new NetObjectRegistry();
      const obj = new NetObject({id: 'cube-1', ownerId: 'peer-A'});
      reg.add(obj);
      expect(reg.applyRelease('cube-1', 'peer-B')).toBe(false);
      expect(obj.ownerId).toBe('peer-A');
    });

    it('retains the latest claim in snapshots, including its released state', () => {
      const reg = new NetObjectRegistry();
      const obj = new NetObject({id: 'cube'});
      reg.add(obj);
      expect(
        reg.applyOwnershipSnapshot('cube', '', {counter: 7, peerId: 'b'})
      ).toBe(true);
      expect(obj.claim).toEqual({counter: 7, peerId: 'b'});
      expect(reg.applyOwnershipSnapshot('cube', '')).toBe(false);
      expect(
        reg.applyOwnershipSnapshot('cube', 'a', {counter: 6, peerId: 'a'})
      ).toBe(false);
      expect(
        reg.applyOwnershipSnapshot('cube', 'b', {counter: 7, peerId: 'b'})
      ).toBe(false);
      expect(obj.ownerId).toBe('');
      expect(reg.applyClaim('cube', 'a', 8)).toBe(true);
      expect(obj.ownerId).toBe('a');
      reg.releaseOwnedBy('a');
      expect(reg.applyClaim('cube', 'a', 8)).toBe(false);
      expect(obj.claim).toEqual({counter: 8, peerId: 'a'});
    });

    it.each([0, -1, 1.5, Infinity, Number.MAX_SAFE_INTEGER])(
      'rejects invalid claim counter %s without changing ownership',
      (counter) => {
        const reg = new NetObjectRegistry();
        const obj = new NetObject({id: 'cube', ownerId: 'a'});
        reg.add(obj);
        expect(() => reg.applyClaim('cube', 'b', counter)).toThrow(
          'claim revision'
        );
        expect(obj.ownerId).toBe('a');
        expect(obj.claim).toBeUndefined();
      }
    );

    it('clears ownership and pending target on success', () => {
      const reg = new NetObjectRegistry();
      const obj = new NetObject({id: 'cube-1', ownerId: 'peer-A'});
      reg.add(obj);
      expect(reg.applyRelease('cube-1', 'peer-A')).toBe(true);
      expect(obj.ownerId).toBe('');
    });
  });

  describe('releaseOwnedBy', () => {
    it('clears ownership of every object owned by the given peer', () => {
      const reg = new NetObjectRegistry();
      const a = new NetObject({id: 'a', ownerId: 'peer-A'});
      const b = new NetObject({id: 'b', ownerId: 'peer-A'});
      const c = new NetObject({id: 'c', ownerId: 'peer-B'});
      reg.add(a);
      reg.add(b);
      reg.add(c);
      reg.releaseOwnedBy('peer-A');
      expect(a.ownerId).toBe('');
      expect(b.ownerId).toBe('');
      expect(c.ownerId).toBe('peer-B');
    });
  });
});
