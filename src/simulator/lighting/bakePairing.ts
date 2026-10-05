import * as THREE from 'three';

/**
 * Pure THREE geometry helpers for pairing the day and night bakes of an
 * environment and extracting the geometry that differs between them (window
 * shades). Ported from the validated day/night spike.
 */

/**
 * Quantized world-position key (~5 mm grid): vertices at the same key are the
 * same point across the two bakes.
 */
export function quantizeKey(v: THREE.Vector3): string {
  return [v.x, v.y, v.z].map((x) => Math.round(x * 200)).join(',');
}

/**
 * GLB meshes are non-indexed triangle soup with no normals, so
 * computeVertexNormals gives flat per-face normals and curved cloth visibly
 * facets under the real-time sun. Average the face normals at each shared
 * position - but only across faces within ~50 degrees of each other
 * (crease-aware): averaging across hard edges tilted flat walls' corner
 * vertices and painted a smooth gradient wash over the whole wall panel. The
 * unlit bake base never reads normals, so the endpoints stay pixel-faithful.
 */
export function smoothNormalsByPosition(
  geo: THREE.BufferGeometry,
  creaseDeg = 50
): void {
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const index = geo.index;
  const triCount = index ? index.count / 3 : pos.count / 3;
  const vertAt = (t: number, k: number) =>
    index ? index.getX(t * 3 + k) : t * 3 + k;
  const key = (i: number) =>
    Math.round(pos.getX(i) * 2000) +
    ',' +
    Math.round(pos.getY(i) * 2000) +
    ',' +
    Math.round(pos.getZ(i) * 2000);
  // per-face normals
  const face: THREE.Vector3[] = new Array(triCount);
  const a = new THREE.Vector3(),
    b = new THREE.Vector3(),
    c = new THREE.Vector3(),
    ab = new THREE.Vector3(),
    ac = new THREE.Vector3();
  for (let t = 0; t < triCount; t++) {
    a.fromBufferAttribute(pos, vertAt(t, 0));
    b.fromBufferAttribute(pos, vertAt(t, 1));
    c.fromBufferAttribute(pos, vertAt(t, 2));
    ab.subVectors(b, a);
    ac.subVectors(c, a);
    const n = new THREE.Vector3().crossVectors(ab, ac);
    const l = n.length();
    face[t] = l > 1e-12 ? n.divideScalar(l) : new THREE.Vector3(0, 1, 0);
  }
  // faces sharing each position
  const groups = new Map<string, number[]>();
  for (let t = 0; t < triCount; t++) {
    for (let k = 0; k < 3; k++) {
      const i = vertAt(t, k);
      const kk = key(i);
      let g = groups.get(kk);
      if (!g) groups.set(kk, (g = []));
      g.push(t);
    }
  }
  // crease-aware averaged normals
  const cosCrease = Math.cos(THREE.MathUtils.degToRad(creaseDeg));
  const cosFlat = Math.cos(THREE.MathUtils.degToRad(5));
  const nor = new Float32Array(pos.count * 3);
  const acc = new THREE.Vector3();
  for (let t = 0; t < triCount; t++) {
    const fn = face[t];
    for (let k = 0; k < 3; k++) {
      const i = vertAt(t, k);
      const g = groups.get(key(i))!;
      // Only faces within the crease angle participate. If that set is nearly
      // coplanar, keep the face's own normal: the room shells vary 0.5-3
      // degrees at their seams, and averaging those into a big wall triangle
      // painted the smooth gradient wash the user saw. Flat per-face shading
      // makes it a sub-1% step instead. Hard-edge neighbors (window reveals,
      // 90 degrees) are excluded by the crease test and must not force
      // smoothing.
      acc.set(0, 0, 0);
      let count = 0;
      let flat = true;
      for (const tt of g) {
        const fo = face[tt];
        if (fo.dot(fn) < cosCrease) continue;
        if (fo.dot(fn) < cosFlat) flat = false;
        acc.add(fo);
        count++;
      }
      if (!count) {
        acc.copy(fn);
        count = 1;
      }
      if (flat) {
        nor[i * 3] = fn.x;
        nor[i * 3 + 1] = fn.y;
        nor[i * 3 + 2] = fn.z;
        continue;
      }
      const l = acc.length() || 1;
      nor[i * 3] = acc.x / l;
      nor[i * 3 + 1] = acc.y / l;
      nor[i * 3 + 2] = acc.z / l;
    }
  }
  geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
}

export interface MeshEntry {
  mesh: THREE.Mesh;
  center: THREE.Vector3;
  size: THREE.Vector3;
  /** Quantized vertex keys in bake space. */
  verts: Set<string>;
  /** Per-vertex bake-space positions (one per position attribute entry). */
  worldPositions: THREE.Vector3[];
}

/**
 * Collects per-mesh bounding data and bake-space vertices for mesh pairing.
 * Positions are computed relative to `root`, so two scenes rooted at their own
 * group (one of which may sit inside a transformed environment root) compare
 * in their shared authored space.
 */
export function collectMeshEntries(root: THREE.Object3D): MeshEntry[] {
  root.updateMatrixWorld(true);
  const toRoot = new THREE.Matrix4().copy(root.matrixWorld).invert();
  const out: MeshEntry[] = [];
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const matrix = new THREE.Matrix4().multiplyMatrices(
      toRoot,
      mesh.matrixWorld
    );
    const pos = mesh.geometry.getAttribute('position') as THREE.BufferAttribute;
    const world = new THREE.Vector3();
    const verts = new Set<string>();
    const worldPositions: THREE.Vector3[] = [];
    const box = new THREE.Box3();
    for (let i = 0; i < pos.count; i++) {
      const p = world.fromBufferAttribute(pos, i).applyMatrix4(matrix).clone();
      worldPositions.push(p);
      verts.add(quantizeKey(p));
      box.expandByPoint(p);
    }
    out.push({
      mesh,
      center: box.getCenter(new THREE.Vector3()),
      size: box.getSize(new THREE.Vector3()),
      verts,
      worldPositions,
    });
  });
  return out;
}

/**
 * Pairs each night mesh with the nearest unused day mesh whose world bounds
 * match (the two bakes share vertex-identical geometry for most primitives).
 */
export function pairMeshesByBounds(
  night: MeshEntry[],
  day: MeshEntry[]
): {night: MeshEntry; day: MeshEntry}[] {
  const used = new Set<number>();
  const pairs: {night: MeshEntry; day: MeshEntry}[] = [];
  for (const n of night) {
    let best = -1;
    let bestDistance = Infinity;
    day.forEach((d, i) => {
      if (used.has(i)) return;
      const centerDistance = n.center.distanceTo(d.center);
      const sizeDistance = n.size.distanceTo(d.size);
      if (centerDistance < 0.05 && sizeDistance < 0.05) {
        if (centerDistance < bestDistance) {
          bestDistance = centerDistance;
          best = i;
        }
      }
    });
    if (best >= 0) {
      used.add(best);
      pairs.push({night: n, day: day[best]});
    }
  }
  return pairs;
}

/**
 * Splits the night-only triangles (the state geometry: window shades merged
 * into the room shells) out of a night mesh into their own geometry, baked to
 * bake space. The day body keeps the day geometry.
 */
export function splitNightStateMesh(
  entry: MeshEntry,
  extraKeys: Set<string>
): THREE.BufferGeometry {
  const geo = entry.mesh.geometry;
  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const uv = geo.getAttribute('uv');
  const index = geo.index;
  const triCount = index ? index.count / 3 : pos.count / 3;
  const isExtra = entry.worldPositions.map((p) =>
    extraKeys.has(quantizeKey(p))
  );

  const shade = {pos: [] as number[], uv: [] as number[]};
  for (let t = 0; t < triCount; t++) {
    const i0 = index ? index.getX(t * 3) : t * 3;
    const i1 = index ? index.getX(t * 3 + 1) : t * 3 + 1;
    const i2 = index ? index.getX(t * 3 + 2) : t * 3 + 2;
    const n =
      (isExtra[i0] ? 1 : 0) + (isExtra[i1] ? 1 : 0) + (isExtra[i2] ? 1 : 0);
    // >=1: boundary triangles (housing edge sharing a vert with the wall) are
    // night-state geometry too - at >=2 they fell into the wall bucket which
    // nothing renders, leaving a gap above every roller shade
    if (n < 1) continue;
    for (const i of [i0, i1, i2]) {
      const world = entry.worldPositions[i];
      shade.pos.push(world.x, world.y, world.z);
      if (uv) shade.uv.push(uv.getX(i), uv.getY(i));
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(shade.pos, 3));
  if (shade.uv.length)
    g.setAttribute('uv', new THREE.Float32BufferAttribute(shade.uv, 2));
  smoothNormalsByPosition(g);
  return g;
}

export interface BlindCluster {
  geo: THREE.BufferGeometry;
  topY: number;
}

/**
 * Splits a shade geometry into per-window blind groups (clustered in the x/z
 * plane) so each blind rolls about its OWN housing top, not one shared edge
 * (windows sit at different heights on different walls).
 */
export function clusterBlinds(shadeGeo: THREE.BufferGeometry): BlindCluster[] {
  const pos = shadeGeo.getAttribute('position') as THREE.BufferAttribute;
  const uv = shadeGeo.getAttribute('uv');
  const triCount = pos.count / 3;
  const cents: number[][] = [];
  for (let i = 0; i < triCount; i++) {
    cents.push([
      (pos.getX(i * 3) + pos.getX(i * 3 + 1) + pos.getX(i * 3 + 2)) / 3,
      (pos.getY(i * 3) + pos.getY(i * 3 + 1) + pos.getY(i * 3 + 2)) / 3,
      (pos.getZ(i * 3) + pos.getZ(i * 3 + 1) + pos.getZ(i * 3 + 2)) / 3,
    ]);
  }
  const parent = [...Array(triCount).keys()];
  const find = (a: number): number =>
    parent[a] === a ? a : (parent[a] = find(parent[a]));
  const R = 0.6;
  for (let i = 0; i < triCount; i++)
    for (let j = i + 1; j < triCount; j++) {
      const dx = cents[i][0] - cents[j][0];
      const dz = cents[i][2] - cents[j][2];
      if (dx * dx + dz * dz < R * R) parent[find(i)] = find(j);
    }
  const groups = new Map<number, number[]>();
  for (let i = 0; i < triCount; i++) {
    const r = find(i);
    if (!groups.has(r)) groups.set(r, []);
    groups.get(r)!.push(i);
  }
  const out: BlindCluster[] = [];
  for (const tris of groups.values()) {
    const bucket = {pos: [] as number[], uv: [] as number[]};
    let topY = -1e9;
    for (const t of tris) {
      for (let k = 0; k < 3; k++) {
        const i = t * 3 + k;
        bucket.pos.push(pos.getX(i), pos.getY(i), pos.getZ(i));
        if (uv) bucket.uv.push(uv.getX(i), uv.getY(i));
        topY = Math.max(topY, pos.getY(i));
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(bucket.pos, 3));
    if (bucket.uv.length)
      g.setAttribute('uv', new THREE.Float32BufferAttribute(bucket.uv, 2));
    smoothNormalsByPosition(g);
    out.push({geo: g, topY});
  }
  return out;
}
