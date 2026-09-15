import * as THREE from 'three';
import {describe, expect, it} from 'vitest';

import {HitRegistry} from './HitRegistry';

function surface(x = 0): THREE.Mesh {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(2, 2, 2));
  mesh.position.x = x;
  return mesh;
}

describe('HitRegistry direct-touch reentrancy', () => {
  it.each(['same', 'another'])(
    'isolates bounds during nested containment queries (%s registry)',
    (registryKind) => {
      const registry = new HitRegistry();
      const nested = registryKind === 'same' ? registry : new HitRegistry();
      const outer = surface(0.5);
      const inner = surface(20);
      let callbackCalls = 0;
      registry.register(outer, outer, {
        containsPoint: () => {
          callbackCalls++;
          expect(
            nested.intersectionsAt(new THREE.Vector3(20, 0, 0))
          ).toHaveLength(1);
          expect(
            registry.containsPoint(inner, new THREE.Vector3(20, 0, 0))
          ).toBe(true);
          return true;
        },
      });
      nested.register(inner, inner);

      const [hit] = registry.intersectionsAt(new THREE.Vector3());
      expect(callbackCalls).toBe(1);
      expect(hit.object).toBe(outer);
      expect(hit.distance).toBe(0.5);
    }
  );

  it('isolates bounds when an overridden transform update reenters the registry', () => {
    const registry = new HitRegistry();
    const nested = surface(20);
    const group = new THREE.Group();
    const child = surface(0.5);
    group.add(child);
    const updateWorldMatrix = child.updateWorldMatrix;
    child.updateWorldMatrix = function (parents, children) {
      expect(registry.containsPoint(nested, nested.position)).toBe(true);
      updateWorldMatrix.call(this, parents, children);
    };
    registry.register(group, group);

    expect(registry.containsPoint(group, new THREE.Vector3(10, 0, 0))).toBe(
      false
    );
    expect(registry.intersectionsAt(new THREE.Vector3())[0].distance).toBe(0.5);
  });
});
