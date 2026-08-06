import {describe, it, expect} from 'vitest';

import {NetObject} from './NetObject';

describe('NetObject', () => {
  it('uses an explicit id when provided', () => {
    const obj = new NetObject({id: 'cube-7'});
    expect(obj.netId).toBe('cube-7');
  });

  it('isOwnedBy reflects current owner', () => {
    const obj = new NetObject({ownerId: 'peer-A'});
    expect(obj.isOwnedBy('peer-A')).toBe(true);
    expect(obj.isOwnedBy('peer-B')).toBe(false);
    expect(obj.isOwnedBy('')).toBe(false);
  });

  describe('toXform / setTargetXform / snapToXform', () => {
    it('toXform snapshots position, quaternion, scale (10 floats)', () => {
      const obj = new NetObject();
      obj.position.set(1, 2, 3);
      obj.quaternion.set(0.1, 0.2, 0.3, 0.927);
      obj.scale.set(2, 3, 4);
      const x = obj.toXform();
      expect(x).toHaveLength(10);
      expect(x.slice(0, 3)).toEqual([1, 2, 3]);
      expect(x.slice(3, 7)).toEqual([0.1, 0.2, 0.3, 0.927]);
      expect(x.slice(7, 10)).toEqual([2, 3, 4]);
    });

    it('snapToXform writes local transform and clears target', () => {
      const obj = new NetObject();
      obj.setTargetXform([5, 5, 5, 0, 0, 0, 1, 1, 1, 1]);
      obj.snapToXform([10, 11, 12, 0, 0, 0, 1, 2, 2, 2]);
      expect(obj.position.toArray()).toEqual([10, 11, 12]);
      expect(obj.scale.toArray()).toEqual([2, 2, 2]);
      expect(obj._hasTarget).toBe(false);
    });
  });

  describe('stepInterpolation', () => {
    it('lerps position toward target', () => {
      const obj = new NetObject();
      obj.position.set(0, 0, 0);
      obj.setTargetXform([10, 0, 0, 0, 0, 0, 1, 1, 1, 1]);
      obj.stepInterpolation(0.5);
      expect(obj.position.x).toBeCloseTo(5, 5);
    });

    it('clamps lerp coefficient to 1', () => {
      const obj = new NetObject();
      obj.position.set(0, 0, 0);
      obj.setTargetXform([10, 0, 0, 0, 0, 0, 1, 1, 1, 1]);
      obj.stepInterpolation(5); // way past 1
      expect(obj.position.x).toBeCloseTo(10, 5);
    });
  });
});
