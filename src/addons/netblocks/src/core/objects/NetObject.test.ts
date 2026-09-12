import * as THREE from 'three';
import {describe, it, expect, vi} from 'vitest';

import {NetObject} from './NetObject';

describe('NetObject', () => {
  it('uses an explicit id when provided', () => {
    const obj = new NetObject({id: 'cube-7'});
    expect(obj.netId).toBe('cube-7');
  });

  it('replicates itself by default and still accepts child objects', () => {
    const obj = new NetObject();
    const child = new THREE.Object3D();
    obj.add(child);
    expect(obj.object).toBe(obj);
    expect(obj.children).toEqual([child]);
    expect(child.parent).toBe(obj);
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

  describe('existing object target', () => {
    it('preserves the target hierarchy and resources through transform updates', () => {
      const parent = new THREE.Group();
      const target = new THREE.Mesh(
        new THREE.BoxGeometry(),
        new THREE.MeshBasicMaterial()
      );
      const child = new THREE.Object3D();
      const sibling = new THREE.Object3D();
      target.add(child);
      parent.add(target, sibling);
      const children = target.children;
      const siblings = parent.children;
      const disposeGeometry = vi.spyOn(target.geometry, 'dispose');
      const disposeMaterial = vi.spyOn(target.material, 'dispose');
      const obj = new NetObject({object: target});
      obj.snapToXform([1, 2, 3, 0, 0, 0, 1, 2, 3, 4]);
      obj.setTargetXform([4, 5, 6, 0, 0, 0, 1, 4, 5, 6]);
      obj.stepInterpolation(0.5);
      expect(obj.object).toBe(target);
      expect(target.parent).toBe(parent);
      expect(target.children).toBe(children);
      expect(target.children).toEqual([child]);
      expect(child.parent).toBe(target);
      expect(parent.children).toBe(siblings);
      expect(parent.children).toEqual([target, sibling]);
      expect(obj.children).toEqual([]);
      expect(obj.position.toArray()).toEqual([0, 0, 0]);
      expect(obj.quaternion.toArray()).toEqual([0, 0, 0, 1]);
      expect(obj.scale.toArray()).toEqual([1, 1, 1]);
      expect(disposeGeometry).not.toHaveBeenCalled();
      expect(disposeMaterial).not.toHaveBeenCalled();
      disposeGeometry.mockRestore();
      disposeMaterial.mockRestore();
      target.geometry.dispose();
      target.material.dispose();
    });

    it('serializes the target local transform rather than its world or wrapper transform', () => {
      const parent = new THREE.Group();
      parent.position.set(10, 20, 30);
      parent.rotation.y = Math.PI / 2;
      parent.scale.setScalar(2);
      const target = new THREE.Object3D();
      parent.add(target);
      const obj = new NetObject({object: target});
      obj.position.set(100, 200, 300);
      target.position.set(1, 2, 3);
      target.quaternion.set(0.1, 0.2, 0.3, 0.927);
      target.scale.set(2, 3, 4);
      expect(obj.toXform()).toEqual([1, 2, 3, 0.1, 0.2, 0.3, 0.927, 2, 3, 4]);
    });
  });

  describe.each(['standalone', 'target'] as const)(
    '%s transform behavior',
    (mode) => {
      function createObject() {
        return new NetObject({
          object: mode === 'target' ? new THREE.Object3D() : undefined,
        });
      }

      it('snaps the full transform and clears pending final interpolation', () => {
        const obj = createObject();
        obj.setTargetXform([5, 5, 5, 0, 0, 0, 1, 1, 1, 1]);
        obj._pendingFinal = true;
        const snapshot = [10, 11, 12, 0, 1, 0, 0, 2, 3, 4];
        obj.snapToXform(snapshot);
        expect(obj.object.position.toArray()).toEqual(snapshot.slice(0, 3));
        expect(obj.object.quaternion.toArray()).toEqual(snapshot.slice(3, 7));
        expect(obj.object.scale.toArray()).toEqual(snapshot.slice(7, 10));
        expect(obj._hasTarget).toBe(false);
        expect(obj._pendingFinal).toBe(false);
        expect(obj._dirty).toBe(true);
        obj.stepInterpolation(1);
        expect(obj.toXform()).toEqual(snapshot);
      });

      it('interpolates position, quaternion, and scale on the replicated object', () => {
        const obj = createObject();
        obj.object.position.set(2, 4, 6);
        obj.object.scale.set(2, 3, 4);
        const rotation = new THREE.Quaternion().setFromAxisAngle(
          new THREE.Vector3(0, 1, 0),
          Math.PI / 2
        );
        obj.setTargetXform([6, 8, 10, ...rotation.toArray(), 4, 5, 6]);
        obj.stepInterpolation(0.5);
        expect(obj.object.position.toArray()).toEqual([4, 6, 8]);
        expect(obj.object.quaternion.angleTo(rotation)).toBeCloseTo(
          Math.PI / 4
        );
        expect(obj.object.scale.toArray()).toEqual([3, 4, 5]);
        expect(obj._hasTarget).toBe(true);
      });

      it('finishes post-release interpolation using the replicated object position', () => {
        const obj = createObject();
        const final = [10, 2, 3, 0, 1, 0, 0, 2, 3, 4];
        obj.setTargetXform(final);
        obj._pendingFinal = true;
        obj.stepInterpolation(0.5);
        expect(obj._pendingFinal).toBe(true);
        expect(obj._hasTarget).toBe(true);
        obj.object.position.set(10.0001, 2, 3);
        obj.stepInterpolation(0.5);
        expect(obj.toXform()).toEqual(final);
        expect(obj._pendingFinal).toBe(false);
        expect(obj._hasTarget).toBe(false);
      });
    }
  );
});
