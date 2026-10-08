import {describe, expect, it} from 'vitest';
import * as THREE from 'three';

import {
  clusterBlinds,
  MeshEntry,
  quantizeKey,
  smoothNormalsByPosition,
  splitNightStateMesh,
} from './bakePairing';

function readNormal(geo: THREE.BufferGeometry, index: number) {
  const nor = geo.getAttribute('normal') as THREE.BufferAttribute;
  return new THREE.Vector3(
    nor.getX(index),
    nor.getY(index),
    nor.getZ(index)
  ).normalize();
}

function faceNormal(positions: number[], t: number): THREE.Vector3 {
  const a = new THREE.Vector3().fromArray(positions, t * 9);
  const b = new THREE.Vector3().fromArray(positions, t * 9 + 3);
  const c = new THREE.Vector3().fromArray(positions, t * 9 + 6);
  return new THREE.Vector3().crossVectors(b.sub(a), c.sub(a)).normalize();
}

describe('smoothNormalsByPosition', () => {
  it('averages normals across a curved strip of ~30 degree quads', () => {
    // Arc approximated by flat quads: consecutive quads meet at a 30 degree
    // dihedral, so shared-position normals must smooth across the seam.
    const radius = 2;
    const step = THREE.MathUtils.degToRad(30);
    const point = (i: number): [number, number] => [
      radius * Math.sin(i * step),
      radius * (1 - Math.cos(i * step)),
    ];
    const positions: number[] = [];
    for (let i = 0; i < 3; i++) {
      const [x0, y0] = point(i);
      const [x1, y1] = point(i + 1);
      positions.push(
        x0,
        y0,
        0,
        x1,
        y1,
        0,
        x1,
        y1,
        1,
        x0,
        y0,
        0,
        x1,
        y1,
        1,
        x0,
        y0,
        1
      );
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3)
    );
    smoothNormalsByPosition(geo);
    for (let i = 0; i < 2; i++) {
      // soup layout per quad: [A, B, C, A, C, D]; B of quad i and A of quad
      // i+1 share a position and must receive the same smoothed normal.
      const n1 = readNormal(geo, i * 6 + 1);
      const n2 = readNormal(geo, (i + 1) * 6);
      expect(n1.dot(n2)).toBeGreaterThan(0.99);
    }
  });

  it('keeps flat wall normals untilted by a 90 degree flap on a shared edge', () => {
    // Two coplanar wall quads in the y=0 plane (normal +y) plus a vertical
    // flap standing on the shared edge x=1: the wall faces must keep their
    // own normal (the flap is excluded by the crease test).
    const positions: number[] = [];
    const wallQuad = (x0: number, x1: number) => {
      positions.push(
        x0,
        0,
        0,
        x1,
        0,
        1,
        x1,
        0,
        0,
        x0,
        0,
        0,
        x0,
        0,
        1,
        x1,
        0,
        1
      );
    };
    wallQuad(0, 1);
    wallQuad(1, 2);
    // flap: x=1 plane, y 0..1, z 0..1
    positions.push(1, 0, 0, 1, 1, 1, 1, 1, 0, 1, 0, 0, 1, 0, 1, 1, 1, 1);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3)
    );
    smoothNormalsByPosition(geo);
    // soup vertex 1 of wall quad 0 is the shared-edge corner (1,0,0) and its
    // face normal is +y; the 90 degree flap must not tilt it.
    const expected = faceNormal(positions, 0);
    const actual = readNormal(geo, 1);
    expect(actual.dot(expected)).toBeGreaterThan(0.999);
  });
});

describe('splitNightStateMesh', () => {
  it('keeps boundary triangles touching the extra set via exactly one vertex', () => {
    // T0 never touches the extra set, T1 touches it via EXACTLY ONE shared
    // vertex (the housing-edge boundary case), T2 is fully extra.
    const positions = [
      // T0: no extra verts
      0, 0, 0, 1, 0, 0, 0, 0, 1,
      // T1: exactly one extra vert, shared with T2
      1, 0, 0, 3, 0, 0, 1, 0, 1,
      // T2: all three verts extra
      3, 0, 0, 4, 0, 0, 3, 0, 1,
    ];
    const uvs = [0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1];
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3)
    );
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    const worldPositions: THREE.Vector3[] = [];
    for (let i = 0; i < positions.length; i += 3) {
      worldPositions.push(new THREE.Vector3().fromArray(positions, i));
    }
    const entry: MeshEntry = {
      mesh: new THREE.Mesh(geo),
      center: new THREE.Vector3(),
      size: new THREE.Vector3(),
      verts: new Set(worldPositions.map(quantizeKey)),
      worldPositions,
    };
    const extraKeys = new Set([
      quantizeKey(new THREE.Vector3(3, 0, 0)),
      quantizeKey(new THREE.Vector3(4, 0, 0)),
      quantizeKey(new THREE.Vector3(3, 0, 1)),
    ]);
    const shade = splitNightStateMesh(entry, extraKeys);
    // T1 + T2 survive (at >=2 T1 fell into the discarded wall bucket and
    // left a gap above every roller shade); T0 does not.
    expect(shade.getAttribute('position').count).toBe(6);
    expect(shade.getAttribute('uv').count).toBe(6);
    const pos = shade.getAttribute('position') as THREE.BufferAttribute;
    const out: number[][] = [];
    for (let i = 0; i < pos.count; i++) {
      out.push([pos.getX(i), pos.getY(i), pos.getZ(i)]);
    }
    expect(out).toEqual([
      [1, 0, 0],
      [3, 0, 0],
      [1, 0, 1],
      [3, 0, 0],
      [4, 0, 0],
      [3, 0, 1],
    ]);
  });
});

describe('clusterBlinds', () => {
  it('keeps blinds 2m apart in their own clusters with their own topY', () => {
    const positions: number[] = [];
    const quad = (x: number, topY: number) => {
      // two triangles of a narrow vertical quad near (x, z=0)
      positions.push(
        x,
        0,
        0,
        x + 0.2,
        0,
        0,
        x + 0.2,
        topY,
        0,
        x,
        0,
        0,
        x + 0.2,
        topY,
        0,
        x,
        topY,
        0
      );
    };
    quad(0, 1.5);
    quad(0.4, 1.2);
    quad(2, 2.2);
    quad(2.4, 1.9);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      'position',
      new THREE.Float32BufferAttribute(positions, 3)
    );
    const clusters = clusterBlinds(geo);
    expect(clusters).toHaveLength(2);
    const topYs = clusters.map((c) => c.topY).sort((a, b) => a - b);
    expect(topYs[0]).toBeCloseTo(1.5);
    expect(topYs[1]).toBeCloseTo(2.2);
    for (const cluster of clusters) {
      expect(cluster.geo.getAttribute('position').count).toBe(12);
    }
  });
});
