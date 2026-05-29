import {describe, it, expect} from 'vitest';

import {NetObject} from './NetObject';

describe('NetObject', () => {
  it('generates a stable id when none is provided', () => {
    const obj = new NetObject();
    expect(obj.netId).toMatch(/^obj_/);
    expect(obj.netId.length).toBeGreaterThan(4);
  });

  it('uses an explicit id when provided', () => {
    const obj = new NetObject({id: 'cube-7'});
    expect(obj.netId).toBe('cube-7');
  });

  it('starts unowned by default', () => {
    expect(new NetObject().ownerId).toBe('');
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

    it('setTargetXform sets target without touching local transform', () => {
      const obj = new NetObject();
      obj.setTargetXform([5, 5, 5, 0, 0, 0, 1, 1, 1, 1]);
      expect(obj._targetPosition.toArray()).toEqual([5, 5, 5]);
      expect(obj._hasTarget).toBe(true);
      // Local transform untouched.
      expect(obj.position.toArray()).toEqual([0, 0, 0]);
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
    it('does nothing when there is no target', () => {
      const obj = new NetObject();
      obj.position.set(1, 2, 3);
      obj.stepInterpolation(0.5);
      expect(obj.position.toArray()).toEqual([1, 2, 3]);
    });

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

  describe('_dirty flag', () => {
    it('starts false on a fresh NetObject', () => {
      expect(new NetObject()._dirty).toBe(false);
    });

    it('is set by setTargetXform', () => {
      const obj = new NetObject();
      obj.setTargetXform([1, 2, 3, 0, 0, 0, 1, 1, 1, 1]);
      expect(obj._dirty).toBe(true);
    });

    it('is set by snapToXform', () => {
      const obj = new NetObject();
      obj.snapToXform([1, 2, 3, 0, 0, 0, 1, 1, 1, 1]);
      expect(obj._dirty).toBe(true);
    });
  });

  describe('_pendingFinal', () => {
    it('starts false on a fresh NetObject', () => {
      expect(new NetObject()._pendingFinal).toBe(false);
    });

    it('snapToXform clears _pendingFinal', () => {
      const obj = new NetObject();
      obj._pendingFinal = true;
      obj.snapToXform([1, 2, 3, 0, 0, 0, 1, 1, 1, 1]);
      expect(obj._pendingFinal).toBe(false);
    });

    it('stepInterpolation finalises and clears _pendingFinal once converged', () => {
      const obj = new NetObject();
      obj.position.set(0, 0, 0);
      obj.setTargetXform([1, 0, 0, 0, 0, 0, 1, 1, 1, 1]);
      obj._pendingFinal = true;
      // Run enough steps for the lerp to converge below 1mm.
      for (let i = 0; i < 200; i++) obj.stepInterpolation(0.5);
      expect(obj._pendingFinal).toBe(false);
      expect(obj._hasTarget).toBe(false);
      expect(obj.position.x).toBeCloseTo(1, 6);
    });
  });
});
