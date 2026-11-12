import * as THREE from 'three';
import {describe, expect, it} from 'vitest';
import {
  clusterBlinds,
  type MeshEntry,
  quantizeKey,
  smoothNormalsByPosition,
  splitNightStateMesh,
} from './bakePairing';

function geometry(positions: number[]) {
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute(
    'uv',
    new THREE.Float32BufferAttribute(
      new Array((positions.length / 3) * 2).fill(0),
      2
    )
  );
  return geo;
}
function normal(geo: THREE.BufferGeometry, index: number) {
  return new THREE.Vector3()
    .fromBufferAttribute(geo.getAttribute('normal'), index)
    .normalize();
}

describe('Bake geometry', () => {
  it('smooths a curved seam while preserving a sharp crease', () => {
    // Adjacent wall triangles share an edge; bend the second by 30 or 90 degrees.
    for (const angle of [Math.PI / 6, Math.PI / 2]) {
      const c = Math.cos(angle),
        s = Math.sin(angle);
      const geo = geometry([
        0,
        0,
        0,
        1,
        0,
        0,
        0,
        0,
        -1,
        0,
        0,
        0,
        0,
        0,
        -1,
        -c,
        s,
        0,
      ]);
      smoothNormalsByPosition(geo);
      const first = normal(geo, 0);
      const second = normal(geo, 3);
      if (angle < Math.PI / 2) expect(first.dot(second)).toBeGreaterThan(0.99);
      else {
        expect(first.dot(new THREE.Vector3(0, 1, 0))).toBeGreaterThan(0.999);
        expect(first.dot(second)).toBeCloseTo(0);
      }
      geo.dispose();
    }
  });

  it('keeps connected boundary triangles when separating night-only geometry', () => {
    const positions = [
      0, 0, 0, 1, 0, 0, 0, 0, 1, 1, 0, 0, 3, 0, 0, 1, 0, 1, 3, 0, 0, 4, 0, 0, 3,
      0, 1,
    ];
    const geo = geometry(positions);
    const worldPositions = Array.from(
      {length: positions.length / 3},
      (_, index) => new THREE.Vector3().fromArray(positions, index * 3)
    );
    const entry: MeshEntry = {
      mesh: new THREE.Mesh(geo),
      center: new THREE.Vector3(),
      size: new THREE.Vector3(),
      verts: new Set(worldPositions.map(quantizeKey)),
      worldPositions,
    };
    const shade = splitNightStateMesh(
      entry,
      new Set(worldPositions.slice(6).map(quantizeKey))
    );
    expect(Array.from(shade.getAttribute('position').array)).toEqual(
      positions.slice(9)
    );
    expect(shade.getAttribute('uv').count).toBe(6);
    shade.dispose();
    geo.dispose();
  });

  it('keeps separate blind assemblies in separate groups without losing triangles', () => {
    const geo = geometry([
      0, 0, 0, 0.2, 0, 0, 0.2, 1.5, 0, 0, 0, 0, 0.2, 1.5, 0, 0, 1.5, 0, 2, 0, 0,
      2.2, 0, 0, 2.2, 2, 0, 2, 0, 0, 2.2, 2, 0, 2, 2, 0,
    ]);
    const clusters = clusterBlinds(geo);
    expect(clusters).toHaveLength(2);
    const bounds = clusters.map(({geo: group}) => {
      group.computeBoundingBox();
      return group.boundingBox!;
    });
    expect(bounds[0].intersectsBox(bounds[1])).toBe(false);
    expect(
      clusters.reduce(
        (sum, cluster) => sum + cluster.geo.getAttribute('position').count,
        0
      )
    ).toBe(geo.getAttribute('position').count);
    for (const cluster of clusters) cluster.geo.dispose();
    geo.dispose();
  });
});
