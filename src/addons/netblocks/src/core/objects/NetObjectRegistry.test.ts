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
  });

  describe('applyRelease', () => {
    it('only the current owner may release', () => {
      const reg = new NetObjectRegistry();
      const obj = new NetObject({id: 'cube-1', ownerId: 'peer-A'});
      reg.add(obj);
      expect(reg.applyRelease('cube-1', 'peer-B')).toBe(false);
      expect(obj.ownerId).toBe('peer-A');
    });

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
