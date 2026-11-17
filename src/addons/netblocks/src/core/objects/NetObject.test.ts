import * as THREE from 'three';
import {describe, it, expect, vi} from 'vitest';

import {NetObject} from './NetObject';

describe('NetObject', () => {
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
      });
    }
  );
});
