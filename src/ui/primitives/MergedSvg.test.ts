import * as THREE from 'three';
import {expect, it} from 'vitest';
import {parseMergedSvg} from './MergedSvg';

it('preserves SVG bounds and downward image coordinates in the scene', () => {
  const {meshes, boundingBox} = parseMergedSvg(
    '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><path d="M2 2h6v6H2z"/></svg>'
  );
  try {
    expect(boundingBox?.size.toArray().slice(0, 2)).toEqual([24, 24]);
    expect(boundingBox?.center.toArray().slice(0, 2)).toEqual([12, -12]);
    const bounds = new THREE.Box3();
    for (const mesh of meshes)
      bounds.union(new THREE.Box3().setFromObject(mesh));
    expect(bounds.min.x).toBeCloseTo(2);
    expect(bounds.max.x).toBeCloseTo(8);
    expect(bounds.min.y).toBeCloseTo(-8);
    expect(bounds.max.y).toBeCloseTo(-2);
  } finally {
    for (const mesh of meshes) {
      mesh.geometry.dispose();
      const materials = Array.isArray(mesh.material)
        ? mesh.material
        : [mesh.material];
      for (const material of materials) material.dispose();
    }
  }
});
