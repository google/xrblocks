import {describe, it, expect} from 'vitest';

import {NetObject} from './NetObject';
import {NetObjectRegistry} from './NetObjectRegistry';

describe('NetObjectRegistry', () => {
  it('add / get / has / remove work as expected', () => {
    const reg = new NetObjectRegistry();
    const obj = new NetObject({id: 'cube-1'});
    reg.add(obj);
    expect(reg.has('cube-1')).toBe(true);
    expect(reg.get('cube-1')).toBe(obj);
    reg.remove(obj);
    expect(reg.has('cube-1')).toBe(false);
    expect(reg.get('cube-1')).toBeUndefined();
  });

  it('values() iterates registered objects', () => {
    const reg = new NetObjectRegistry();
    const a = new NetObject({id: 'a'});
    const b = new NetObject({id: 'b'});
    reg.add(a);
    reg.add(b);
    expect([...reg.values()]).toEqual(expect.arrayContaining([a, b]));
  });

  describe('applyClaim', () => {
    it('returns false for unknown id', () => {
      const reg = new NetObjectRegistry();
      expect(reg.applyClaim('nope', 'peer-A')).toBe(false);
    });

    it('grants ownership unconditionally — explicit grabs preempt', () => {
      const reg = new NetObjectRegistry();
      const obj = new NetObject({id: 'cube-1', ownerId: 'peer-A'});
      reg.add(obj);
      expect(reg.applyClaim('cube-1', 'peer-B')).toBe(true);
      expect(obj.ownerId).toBe('peer-B');
    });

    it('clears any pending interp target on ownership change', () => {
      const reg = new NetObjectRegistry();
      const obj = new NetObject({id: 'cube-1', ownerId: 'peer-A'});
      obj.setTargetXform([1, 2, 3, 0, 0, 0, 1, 1, 1, 1]);
      reg.add(obj);
      reg.applyClaim('cube-1', 'peer-B');
      expect(obj._hasTarget).toBe(false);
    });

    it('does not clear target when peer reclaims their own object', () => {
      const reg = new NetObjectRegistry();
      const obj = new NetObject({id: 'cube-1', ownerId: 'peer-A'});
      obj.setTargetXform([1, 2, 3, 0, 0, 0, 1, 1, 1, 1]);
      reg.add(obj);
      reg.applyClaim('cube-1', 'peer-A');
      expect(obj._hasTarget).toBe(true);
    });

    it('clears _pendingFinal when ownership transfers — the new owner is about to broadcast their own pose', () => {
      const reg = new NetObjectRegistry();
      const obj = new NetObject({id: 'cube-1', ownerId: 'peer-A'});
      obj.setTargetXform([1, 2, 3, 0, 0, 0, 1, 1, 1, 1]);
      obj._pendingFinal = true;
      reg.add(obj);
      reg.applyClaim('cube-1', 'peer-B');
      expect(obj._pendingFinal).toBe(false);
    });
  });

  describe('applyRelease', () => {
    it('returns false for unknown id', () => {
      const reg = new NetObjectRegistry();
      expect(reg.applyRelease('nope', 'peer-A')).toBe(false);
    });

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
      obj.setTargetXform([1, 2, 3, 0, 0, 0, 1, 1, 1, 1]);
      reg.add(obj);
      expect(reg.applyRelease('cube-1', 'peer-A')).toBe(true);
      expect(obj.ownerId).toBe('');
      expect(obj._hasTarget).toBe(false);
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

    it('is a no-op when the peer owns nothing', () => {
      const reg = new NetObjectRegistry();
      const a = new NetObject({id: 'a', ownerId: 'peer-A'});
      reg.add(a);
      reg.releaseOwnedBy('peer-Z');
      expect(a.ownerId).toBe('peer-A');
    });
  });
});
