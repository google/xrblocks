import * as THREE from 'three';
import {SimulatorPlaneType, SimulatorPlane} from 'xrblocks';

interface PlaneAccumulator {
  type: SimulatorPlaneType;
  normal: THREE.Vector3;
  constant: number;
  totalArea: number;
  vertices: THREE.Vector3[];
}

// ------------------------------------------------------------------
// Main Function
// ------------------------------------------------------------------

export function findPlanesInScene(
  root: THREE.Object3D,
  minArea: number = 0.1
): SimulatorPlane[] {
  const planesMap = new Map<string, PlaneAccumulator>();
  const upVector = new THREE.Vector3(0, 1, 0);

  // Temps
  const _vA = new THREE.Vector3();
  const _vB = new THREE.Vector3();
  const _vC = new THREE.Vector3();
  const _edge1 = new THREE.Vector3();
  const _edge2 = new THREE.Vector3();
  const _normal = new THREE.Vector3();

  root.updateMatrixWorld(true);

  // 1. Clustering Phase
  root.traverse((obj) => {
    if (!(obj as THREE.Mesh).isMesh) return;
    const mesh = obj as THREE.Mesh;
    const geometry = mesh.geometry;
    const posAttr = geometry.attributes.position;
    const indexAttr = geometry.index;
    if (!posAttr) return;

    const getVertexWorld = (idx: number, target: THREE.Vector3) => {
      target.fromBufferAttribute(posAttr, idx);
      target.applyMatrix4(mesh.matrixWorld);
    };

    const count = indexAttr ? indexAttr.count / 3 : posAttr.count / 3;

    for (let i = 0; i < count; i++) {
      let a, b, c;
      if (indexAttr) {
        a = indexAttr.getX(i * 3);
        b = indexAttr.getX(i * 3 + 1);
        c = indexAttr.getX(i * 3 + 2);
      } else {
        a = i * 3;
        b = i * 3 + 1;
        c = i * 3 + 2;
      }

      getVertexWorld(a, _vA);
      getVertexWorld(b, _vB);
      getVertexWorld(c, _vC);

      // Compute Normal & Area
      _edge1.subVectors(_vB, _vA);
      _edge2.subVectors(_vC, _vA);
      _normal.crossVectors(_edge1, _edge2);

      const combinedLen = _normal.length();
      const area = combinedLen * 0.5;
      if (area < 1e-6) continue;

      _normal.divideScalar(combinedLen);

      // Classify
      const absDot = Math.abs(_normal.dot(upVector));
      let type: SimulatorPlaneType | null = null;
      if (absDot >= 0.9) type = 'horizontal';
      else if (absDot <= 0.1) type = 'vertical';

      if (!type) continue;

      // Plane Constant D
      const d = -_normal.dot(_vA);

      // Hash Key
      const precision = 2;
      const nx = (Math.round(_normal.x * 100) / 100).toFixed(precision);
      const ny = (Math.round(_normal.y * 100) / 100).toFixed(precision);
      const nz = (Math.round(_normal.z * 100) / 100).toFixed(precision);
      const dist = d.toFixed(precision);
      const key = `${type}_${nx}_${ny}_${nz}_${dist}`;

      let acc = planesMap.get(key);
      if (!acc) {
        acc = {
          type,
          normal: _normal.clone(),
          constant: d,
          totalArea: 0,
          vertices: [],
        };
        planesMap.set(key, acc);
      }

      acc.totalArea += area;
      // We store all vertices to calculate the exact bounds later
      acc.vertices.push(_vA.clone(), _vB.clone(), _vC.clone());
    }
  });

  // 2. Geometry Projection & Clustering Phase
  const results: SimulatorPlane[] = [];

  for (const [_, data] of planesMap) {
    if (data.totalArea < minArea) continue;

    // A. Define Local Coordinate System
    const quaternion = new THREE.Quaternion().setFromUnitVectors(
      upVector,
      data.normal
    );
    const inverseRotation = quaternion.clone().invert();

    // B. Project all vertices to Local 2D Space
    // We'll store them as {x, y, originalIndex}
    // Note: Local Y is constant (plane constant), we care about X and Z (mapped to x,y for 2D clustering)
    const localPoints: {x: number; y: number; vec: THREE.Vector3}[] = [];
    // Global center sum unused now as we calculate per cluster

    // We need a reference point for projection to avoid large number precision issues?
    // Actually just projecting relative to the first vertex is fine for local coords.
    const origin = data.vertices[0].clone();

    for (const v of data.vertices) {
      const tempVec = new THREE.Vector3().subVectors(v, origin);
      tempVec.applyQuaternion(inverseRotation);
      // In local space: x=x, y=0 (approx), z=z.
      // We map 3D (x,y,z) -> 2D (x, z)
      localPoints.push({x: tempVec.x, y: tempVec.z, vec: v});
    }

    // C. Cluster Triangles
    // We treat each triangle as an atomic unit.
    // We merge triangles if they share vertices (or have vertices very close to each other).

    const clusteringThreshold = 0.2; // 20cm gap allowed for continuity
    const thresholdSq = clusteringThreshold * clusteringThreshold;

    // We'll using a simple spatial acceleration for vertex matching
    // 1. Identify unique spatial vertices (within threshold) using a Grid
    // 2. Build connectivity graph of triangles

    const numTriangles = Math.floor(localPoints.length / 3);
    const parent = new Int32Array(numTriangles);
    for (let i = 0; i < numTriangles; i++) parent[i] = i;

    const find = (i: number): number => {
      if (parent[i] === i) return i;
      parent[i] = find(parent[i]);
      return parent[i];
    };
    const union = (i: number, j: number) => {
      const rootI = find(i);
      const rootJ = find(j);
      if (rootI !== rootJ) parent[rootI] = rootJ;
    };

    // Grid for vertices: key -> list of {triangleIndex, vertexIndexInTriangle} (actually just triangleIndex is enough)
    // We only need to know "which triangles possess a vertex in this cell"
    const cellSize = clusteringThreshold;
    const grid = new Map<string, number[]>(); // key -> triangle indices

    const getKey = (x: number, y: number) => {
      const kx = Math.floor(x / cellSize);
      const ky = Math.floor(y / cellSize);
      return `${kx},${ky}`;
    };

    // Pre-populate grid
    for (let t = 0; t < numTriangles; t++) {
      // For each vertex in triangle
      for (let k = 0; k < 3; k++) {
        const idx = t * 3 + k;
        const p = localPoints[idx];
        const key = getKey(p.x, p.y);

        if (!grid.has(key)) grid.set(key, []);
        grid.get(key)!.push(t);
      }
    }

    // Connect triangles
    // For each triangle, look at its vertices. Check neighbors in grid.
    // If a neighbor vertex is close, union the two triangles.
    const neighborOffsets = [
      [0, 0],
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
      [1, 1],
      [1, -1],
      [-1, 1],
      [-1, -1],
    ];

    for (let t = 0; t < numTriangles; t++) {
      for (let k = 0; k < 3; k++) {
        const idx = t * 3 + k;
        const p = localPoints[idx];

        const kx = Math.floor(p.x / cellSize);
        const ky = Math.floor(p.y / cellSize);

        for (const offset of neighborOffsets) {
          const nx = kx + offset[0];
          const ny = ky + offset[1];
          const nKey = `${nx},${ny}`;

          const neighbors = grid.get(nKey);
          if (!neighbors) continue;

          for (const otherT of neighbors) {
            if (otherT === t) continue; // Same triangle

            // We found a triangle 'otherT' that has a vertex in this cell (or neighbor cell)
            // We need to verify distance to 'p'
            // Check all 3 vertices of otherT?
            // Optimization: We could store exact vertex index in grid to compare point-to-point.
            // But iterating 3 vertices of otherT is cheap.

            if (find(t) === find(otherT)) continue; // Already merged

            let connected = false;
            for (let j = 0; j < 3; j++) {
              const otherP = localPoints[otherT * 3 + j];
              const dx = p.x - otherP.x;
              const dy = p.y - otherP.y;
              if (dx * dx + dy * dy <= thresholdSq) {
                connected = true;
                break;
              }
            }

            if (connected) {
              union(t, otherT);
            }
          }
        }
      }
    }

    // Group by root
    const clustersMap = new Map<number, number[]>(); // root -> triangle indices
    for (let t = 0; t < numTriangles; t++) {
      const root = find(t);
      if (!clustersMap.has(root)) clustersMap.set(root, []);
      clustersMap.get(root)!.push(t);
    }

    const clusters: {x: number; y: number; vec: THREE.Vector3}[][] = [];
    for (const bin of clustersMap.values()) {
      const clusterPoints: {x: number; y: number; vec: THREE.Vector3}[] = [];
      for (const tIdx of bin) {
        clusterPoints.push(
          localPoints[tIdx * 3],
          localPoints[tIdx * 3 + 1],
          localPoints[tIdx * 3 + 2]
        );
      }
      clusters.push(clusterPoints);
    }

    // D. Process Clusters
    for (const cluster of clusters) {
      if (cluster.length < 3) continue; // Need at least a triangle

      // Calculate Cluster Center for local projection (to avoid large coordinates)
      const clusterCenterSum = new THREE.Vector3();
      for (const p of cluster) {
        clusterCenterSum.add(p.vec);
      }
      const clusterCenter = clusterCenterSum
        .clone()
        .divideScalar(cluster.length);

      // Project all points to local 2D space relative to clusterCenter
      // We need 2D points for boundary tracing
      const clusterPoints2D: THREE.Vector2[] = [];
      for (let i = 0; i < cluster.length; i++) {
        // Re-project relative to clusterCenter
        const v = cluster[i].vec;
        const diff = new THREE.Vector3().subVectors(v, clusterCenter);
        diff.applyQuaternion(inverseRotation);
        clusterPoints2D.push(new THREE.Vector2(diff.x, diff.z));
      }

      // Trace Boundary
      // 1. Quantize vertices to identifying shared edges
      // We assume index i in clusterPoints2D corresponds to vertex i in cluster
      // The cluster array is flat version of triangles (every 3 points = 1 triangle)

      const numTri = Math.floor(cluster.length / 3);
      const edges = new Map<string, number>(); // edgeKey -> count

      // We need robust vertex matching.
      // Let's use a quantized key map.
      const quantization = 1000; // 1mm precision
      const getId = (p: THREE.Vector2) => {
        const ix = Math.round(p.x * quantization);
        const iy = Math.round(p.y * quantization);
        return `${ix},${iy}`;
      };

      // Map original index -> unique quantized ID
      // Determine unique IDs
      const uniqueIds: string[] = [];
      const indexToUniqueId: number[] = [];
      const uniqueIdToIndexMap = new Map<string, number>(); // uniqueIdString -> uniqueIndex (0..N)

      for (let i = 0; i < clusterPoints2D.length; i++) {
        const key = getId(clusterPoints2D[i]);
        let uid = uniqueIdToIndexMap.get(key);
        if (uid === undefined) {
          uid = uniqueIds.length;
          uniqueIds.push(key);
          uniqueIdToIndexMap.set(key, uid);
        }
        indexToUniqueId.push(uid);
      }

      // Count edges
      for (let t = 0; t < numTri; t++) {
        const i0 = indexToUniqueId[t * 3];
        const i1 = indexToUniqueId[t * 3 + 1];
        const i2 = indexToUniqueId[t * 3 + 2];

        // Skip degenerate triangles
        if (i0 === i1 || i1 === i2 || i2 === i0) continue;

        const addEdge = (u: number, v: number) => {
          const k = u < v ? `${u}:${v}` : `${v}:${u}`;
          edges.set(k, (edges.get(k) || 0) + 1);
        };

        addEdge(i0, i1);
        addEdge(i1, i2);
        addEdge(i2, i0);
      }

      // Find boundary edges (count === 1)
      const boundaryEdges: {u: number; v: number}[] = [];
      for (const [k, count] of edges) {
        if (count === 1) {
          const [u, v] = k.split(':').map(Number);
          boundaryEdges.push({u, v});
        }
      }

      if (boundaryEdges.length < 3) continue;

      // Build adjacency graph for boundary
      const adj = new Map<number, number[]>();
      for (const e of boundaryEdges) {
        if (!adj.has(e.u)) adj.set(e.u, []);
        if (!adj.has(e.v)) adj.set(e.v, []);
        adj.get(e.u)!.push(e.v);
        adj.get(e.v)!.push(e.u);
      }

      // Trace loops
      // We pick an arbitrary start node
      const visitedEdges = new Set<string>();
      const loops: number[][] = [];

      // This greedy approach might find multiple loops if there are holes or disjoint islands
      // (though we clustered by connectivity, holes are possible)

      for (const startNode of adj.keys()) {
        if (adj.get(startNode)!.length === 0) continue; // Should not happen

        // Try to find a loop starting here
        // We need to consume edges to avoid re-visiting

        // DFS/Walk
        const path: number[] = [startNode];
        let curr = startNode;
        let foundLoop = false;

        // We only want to start if we haven't visited incident edges?
        // Actually, let's just pick an unvisited edge from startNode
        let next = -1;
        const neighbors = adj.get(curr)!;
        for (const n of neighbors) {
          const k = curr < n ? `${curr}:${n}` : `${n}:${curr}`;
          if (!visitedEdges.has(k)) {
            next = n;
            visitedEdges.add(k);
            break;
          }
        }
        if (next === -1) continue; // All edges visited

        curr = next;
        path.push(curr);

        while (true) {
          if (curr === startNode) {
            foundLoop = true;
            break;
          }

          // Find next unvisited edge
          const nbors = adj.get(curr)!;
          let nextNode = -1;
          for (const n of nbors) {
            // Don't go back immediately unless it's the only way (isolated line) - but count=1 means boundary loop, so every node degree should be 2 ideally for simple loop.
            // If degree > 2, it's touching boundaries (hourglass).

            const k = curr < n ? `${curr}:${n}` : `${n}:${curr}`;
            // We must not reuse edges
            if (visitedEdges.has(k)) continue;

            nextNode = n;
            visitedEdges.add(k);
            break;
          }

          if (nextNode === -1) {
            // Dead end? In a proper mesh boundary, this shouldn't happen unless open geometry.
            break;
          }
          curr = nextNode;
          path.push(curr);
        }

        if (foundLoop) {
          loops.push(path.slice(0, path.length - 1)); // Remove closing duplicate
        }
      }

      // Pick largest loop by bbox or length?
      // Let's pick the one with most vertices for now
      let bestLoop: number[] | null = null;
      let maxLen = -1;

      for (const loop of loops) {
        if (loop.length > maxLen) {
          maxLen = loop.length;
          bestLoop = loop;
        }
      }

      if (!bestLoop || bestLoop.length < 3) continue;

      // Reconstruct Polygon
      // The loop contains Unique IDs. We need coordinates.
      // We can recover coordinates from uniqueIdString or by finding one vertex with that ID.
      // Let's decode uniqueIdString
      const finalPolygon: THREE.Vector2[] = [];
      for (const uid of bestLoop) {
        const key = uniqueIds[uid];
        const [ix, iy] = key.split(',').map(Number);
        finalPolygon.push(
          new THREE.Vector2(ix / quantization, iy / quantization)
        );
      }

      // Simplify Polygon (Collinear)
      const simplified: THREE.Vector2[] = [];
      if (finalPolygon.length > 0) {
        simplified.push(finalPolygon[0]);
        for (let i = 1; i < finalPolygon.length; i++) {
          const prev = simplified[simplified.length - 1];
          const curr = finalPolygon[i];
          const next = finalPolygon[(i + 1) % finalPolygon.length];

          // Check if curr is collinear with prev and next
          const v1 = new THREE.Vector2().subVectors(curr, prev).normalize();
          const v2 = new THREE.Vector2().subVectors(next, curr).normalize();

          // Dot product ~ 1 or -1 means collinear
          // We care about direction preservation, so dot ~ 1 (same direction) means we can skip curr.
          // Wait, if v1 and v2 are same dir, we can skip curr.
          if (v1.dot(v2) > 0.999) {
            // Skip curr
            continue;
          }
          simplified.push(curr);
        }
        // Check last closing alignment
        if (simplified.length > 2) {
          const first = simplified[0];
          const last = simplified[simplified.length - 1];
          const secondLast = simplified[simplified.length - 2];
          const v1 = new THREE.Vector2()
            .subVectors(last, secondLast)
            .normalize();
          const v2 = new THREE.Vector2().subVectors(first, last).normalize();
          if (v1.dot(v2) > 0.999) {
            simplified.pop(); // Remove last if it's collinear with wrap-around
          }
        }
      }

      if (simplified.length < 3) continue;

      // Calculate Area from Polygon
      let polyArea = 0;
      for (let i = 0; i < simplified.length; i++) {
        const j = (i + 1) % simplified.length;
        polyArea +=
          simplified[i].x * simplified[j].y - simplified[j].x * simplified[i].y;
      }
      polyArea = Math.abs(polyArea / 2);

      if (polyArea < minArea) continue;

      results.push({
        type: data.type,
        area: polyArea,
        position: clusterCenter,
        quaternion: quaternion,
        polygon: simplified,
      });
    }
  }

  return results;
}
