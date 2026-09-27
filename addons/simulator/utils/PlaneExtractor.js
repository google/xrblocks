import * as THREE from "three";
//#region src/addons/simulator/utils/PlaneExtractor.ts
function findPlanesInScene(root, minArea = .1) {
	const planesMap = /* @__PURE__ */ new Map();
	const upVector = new THREE.Vector3(0, 1, 0);
	const _vA = new THREE.Vector3();
	const _vB = new THREE.Vector3();
	const _vC = new THREE.Vector3();
	const _edge1 = new THREE.Vector3();
	const _edge2 = new THREE.Vector3();
	const _normal = new THREE.Vector3();
	root.updateMatrixWorld(true);
	root.traverse((obj) => {
		if (!obj.isMesh) return;
		const mesh = obj;
		const geometry = mesh.geometry;
		const posAttr = geometry.attributes.position;
		const indexAttr = geometry.index;
		if (!posAttr) return;
		const getVertexWorld = (idx, target) => {
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
			_edge1.subVectors(_vB, _vA);
			_edge2.subVectors(_vC, _vA);
			_normal.crossVectors(_edge1, _edge2);
			const combinedLen = _normal.length();
			const area = combinedLen * .5;
			if (area < 1e-6) continue;
			_normal.divideScalar(combinedLen);
			const absDot = Math.abs(_normal.dot(upVector));
			let type = null;
			if (absDot >= .9) type = "horizontal";
			else if (absDot <= .1) type = "vertical";
			if (!type) continue;
			const d = -_normal.dot(_vA);
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
					vertices: []
				};
				planesMap.set(key, acc);
			}
			acc.totalArea += area;
			acc.vertices.push(_vA.clone(), _vB.clone(), _vC.clone());
		}
	});
	const results = [];
	for (const [_, data] of planesMap) {
		if (data.totalArea < minArea) continue;
		const quaternion = new THREE.Quaternion().setFromUnitVectors(upVector, data.normal);
		const inverseRotation = quaternion.clone().invert();
		const localPoints = [];
		const origin = data.vertices[0].clone();
		for (const v of data.vertices) {
			const tempVec = new THREE.Vector3().subVectors(v, origin);
			tempVec.applyQuaternion(inverseRotation);
			localPoints.push({
				x: tempVec.x,
				y: tempVec.z,
				vec: v
			});
		}
		const clusteringThreshold = .2;
		const thresholdSq = clusteringThreshold * clusteringThreshold;
		const numTriangles = Math.floor(localPoints.length / 3);
		const parent = new Int32Array(numTriangles);
		for (let i = 0; i < numTriangles; i++) parent[i] = i;
		const find = (i) => {
			if (parent[i] === i) return i;
			parent[i] = find(parent[i]);
			return parent[i];
		};
		const union = (i, j) => {
			const rootI = find(i);
			const rootJ = find(j);
			if (rootI !== rootJ) parent[rootI] = rootJ;
		};
		const cellSize = clusteringThreshold;
		const grid = /* @__PURE__ */ new Map();
		const getKey = (x, y) => {
			return `${Math.floor(x / cellSize)},${Math.floor(y / cellSize)}`;
		};
		for (let t = 0; t < numTriangles; t++) for (let k = 0; k < 3; k++) {
			const p = localPoints[t * 3 + k];
			const key = getKey(p.x, p.y);
			if (!grid.has(key)) grid.set(key, []);
			grid.get(key).push(t);
		}
		const neighborOffsets = [
			[0, 0],
			[1, 0],
			[-1, 0],
			[0, 1],
			[0, -1],
			[1, 1],
			[1, -1],
			[-1, 1],
			[-1, -1]
		];
		for (let t = 0; t < numTriangles; t++) for (let k = 0; k < 3; k++) {
			const p = localPoints[t * 3 + k];
			const kx = Math.floor(p.x / cellSize);
			const ky = Math.floor(p.y / cellSize);
			for (const offset of neighborOffsets) {
				const nKey = `${kx + offset[0]},${ky + offset[1]}`;
				const neighbors = grid.get(nKey);
				if (!neighbors) continue;
				for (const otherT of neighbors) {
					if (otherT === t) continue;
					if (find(t) === find(otherT)) continue;
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
					if (connected) union(t, otherT);
				}
			}
		}
		const clustersMap = /* @__PURE__ */ new Map();
		for (let t = 0; t < numTriangles; t++) {
			const root = find(t);
			if (!clustersMap.has(root)) clustersMap.set(root, []);
			clustersMap.get(root).push(t);
		}
		const clusters = [];
		for (const bin of clustersMap.values()) {
			const clusterPoints = [];
			for (const tIdx of bin) clusterPoints.push(localPoints[tIdx * 3], localPoints[tIdx * 3 + 1], localPoints[tIdx * 3 + 2]);
			clusters.push(clusterPoints);
		}
		for (const cluster of clusters) {
			if (cluster.length < 3) continue;
			const clusterCenterSum = new THREE.Vector3();
			for (const p of cluster) clusterCenterSum.add(p.vec);
			const clusterCenter = clusterCenterSum.clone().divideScalar(cluster.length);
			const clusterPoints2D = [];
			for (let i = 0; i < cluster.length; i++) {
				const v = cluster[i].vec;
				const diff = new THREE.Vector3().subVectors(v, clusterCenter);
				diff.applyQuaternion(inverseRotation);
				clusterPoints2D.push(new THREE.Vector2(diff.x, diff.z));
			}
			const numTri = Math.floor(cluster.length / 3);
			const edges = /* @__PURE__ */ new Map();
			const quantization = 1e3;
			const getId = (p) => {
				return `${Math.round(p.x * quantization)},${Math.round(p.y * quantization)}`;
			};
			const uniqueIds = [];
			const indexToUniqueId = [];
			const uniqueIdToIndexMap = /* @__PURE__ */ new Map();
			for (let i = 0; i < clusterPoints2D.length; i++) {
				const key = getId(clusterPoints2D[i]);
				let uid = uniqueIdToIndexMap.get(key);
				if (uid === void 0) {
					uid = uniqueIds.length;
					uniqueIds.push(key);
					uniqueIdToIndexMap.set(key, uid);
				}
				indexToUniqueId.push(uid);
			}
			for (let t = 0; t < numTri; t++) {
				const i0 = indexToUniqueId[t * 3];
				const i1 = indexToUniqueId[t * 3 + 1];
				const i2 = indexToUniqueId[t * 3 + 2];
				if (i0 === i1 || i1 === i2 || i2 === i0) continue;
				const addEdge = (u, v) => {
					const k = u < v ? `${u}:${v}` : `${v}:${u}`;
					edges.set(k, (edges.get(k) || 0) + 1);
				};
				addEdge(i0, i1);
				addEdge(i1, i2);
				addEdge(i2, i0);
			}
			const boundaryEdges = [];
			for (const [k, count] of edges) if (count === 1) {
				const [u, v] = k.split(":").map(Number);
				boundaryEdges.push({
					u,
					v
				});
			}
			if (boundaryEdges.length < 3) continue;
			const adj = /* @__PURE__ */ new Map();
			for (const e of boundaryEdges) {
				if (!adj.has(e.u)) adj.set(e.u, []);
				if (!adj.has(e.v)) adj.set(e.v, []);
				adj.get(e.u).push(e.v);
				adj.get(e.v).push(e.u);
			}
			const visitedEdges = /* @__PURE__ */ new Set();
			const loops = [];
			for (const startNode of adj.keys()) {
				if (adj.get(startNode).length === 0) continue;
				const path = [startNode];
				let curr = startNode;
				let foundLoop = false;
				let next = -1;
				const neighbors = adj.get(curr);
				for (const n of neighbors) {
					const k = curr < n ? `${curr}:${n}` : `${n}:${curr}`;
					if (!visitedEdges.has(k)) {
						next = n;
						visitedEdges.add(k);
						break;
					}
				}
				if (next === -1) continue;
				curr = next;
				path.push(curr);
				while (true) {
					if (curr === startNode) {
						foundLoop = true;
						break;
					}
					const nbors = adj.get(curr);
					let nextNode = -1;
					for (const n of nbors) {
						const k = curr < n ? `${curr}:${n}` : `${n}:${curr}`;
						if (visitedEdges.has(k)) continue;
						nextNode = n;
						visitedEdges.add(k);
						break;
					}
					if (nextNode === -1) break;
					curr = nextNode;
					path.push(curr);
				}
				if (foundLoop) loops.push(path.slice(0, path.length - 1));
			}
			let bestLoop = null;
			let maxLen = -1;
			for (const loop of loops) if (loop.length > maxLen) {
				maxLen = loop.length;
				bestLoop = loop;
			}
			if (!bestLoop || bestLoop.length < 3) continue;
			const finalPolygon = [];
			for (const uid of bestLoop) {
				const [ix, iy] = uniqueIds[uid].split(",").map(Number);
				finalPolygon.push(new THREE.Vector2(ix / quantization, iy / quantization));
			}
			const simplified = [];
			if (finalPolygon.length > 0) {
				simplified.push(finalPolygon[0]);
				for (let i = 1; i < finalPolygon.length; i++) {
					const prev = simplified[simplified.length - 1];
					const curr = finalPolygon[i];
					const next = finalPolygon[(i + 1) % finalPolygon.length];
					const v1 = new THREE.Vector2().subVectors(curr, prev).normalize();
					const v2 = new THREE.Vector2().subVectors(next, curr).normalize();
					if (v1.dot(v2) > .999) continue;
					simplified.push(curr);
				}
				if (simplified.length > 2) {
					const first = simplified[0];
					const last = simplified[simplified.length - 1];
					const secondLast = simplified[simplified.length - 2];
					const v1 = new THREE.Vector2().subVectors(last, secondLast).normalize();
					const v2 = new THREE.Vector2().subVectors(first, last).normalize();
					if (v1.dot(v2) > .999) simplified.pop();
				}
			}
			if (simplified.length < 3) continue;
			let polyArea = 0;
			for (let i = 0; i < simplified.length; i++) {
				const j = (i + 1) % simplified.length;
				polyArea += simplified[i].x * simplified[j].y - simplified[j].x * simplified[i].y;
			}
			polyArea = Math.abs(polyArea / 2);
			if (polyArea < minArea) continue;
			results.push({
				type: data.type,
				area: polyArea,
				position: clusterCenter,
				quaternion,
				polygon: simplified
			});
		}
	}
	return results;
}
//#endregion
export { findPlanesInScene };
