//#region src/simulator/planes/DepthPlaneTracker.ts
const DEFAULT_CONFIG = {
	minDepthMeters: .2,
	maxDepthMeters: 6,
	minPlaneAreaSqMeters: .08,
	minPlaneExtentMeters: .2,
	maxTrackedPlanes: 48,
	maxPolygonVertices: 24
};
const HORIZONTAL_MIN_ABS_NY = .94;
const VERTICAL_MAX_ABS_NY = .18;
const CEILING_MAX_NY = -.8;
const MIN_CEILING_ABOVE_CAMERA_METERS = .15;
const REGION_GROW_MIN_NORMAL_DOT = .935;
const MAX_REGION_RMS_METERS = .026;
const MAX_FINAL_PLANE_RMS_METERS = .028;
const MAX_PRINCIPAL_CURVATURE = .28;
const MIN_PATCH_NORMAL_CONSISTENCY = .75;
const MIN_PATCH_NORMAL_DOT = .92;
const SAME_FRAME_MERGE_MIN_DOT = .965;
const SAME_FRAME_MERGE_MAX_DIST = .06;
const SAME_FRAME_MERGE_MAX_GAP = .35;
const TRACK_MATCH_MIN_DOT = .95;
const TRACK_MATCH_MAX_PLANE_DIST = .08;
const TRACK_MATCH_MAX_GAP = .35;
const TRACK_CONSOLIDATE_MIN_DOT = .965;
const TRACK_CONSOLIDATE_MAX_PLANE_DIST = .06;
const TRACK_CONSOLIDATE_MAX_GAP = .3;
const TRACK_MAX_MERGED_RMS = .042;
const MAX_ACCUMULATED_WEIGHT = 5e4;
const INTERNAL_MAX_HULL_VERTICES = 48;
const SNAPSHOT_POS_EPS_SQ = 25e-6;
const SNAPSHOT_NORMAL_MIN_DOT = .99995;
const SNAPSHOT_EXTENT_EPS = .01;
const SNAPSHOT_AREA_REL_EPS = .015;
const SNAPSHOT_VERTEX_EPS_SQ = 144e-6;
function createEmptyStats(anchor) {
	return {
		anchor: [
			anchor[0],
			anchor[1],
			anchor[2]
		],
		weight: 0,
		sumX: 0,
		sumY: 0,
		sumZ: 0,
		sumXX: 0,
		sumXY: 0,
		sumXZ: 0,
		sumYY: 0,
		sumYZ: 0,
		sumZZ: 0
	};
}
function cloneStats(s) {
	return {
		anchor: [
			s.anchor[0],
			s.anchor[1],
			s.anchor[2]
		],
		weight: s.weight,
		sumX: s.sumX,
		sumY: s.sumY,
		sumZ: s.sumZ,
		sumXX: s.sumXX,
		sumXY: s.sumXY,
		sumXZ: s.sumXZ,
		sumYY: s.sumYY,
		sumYZ: s.sumYZ,
		sumZZ: s.sumZZ
	};
}
function addPointToStats(stats, x, y, z) {
	const dx = x - stats.anchor[0];
	const dy = y - stats.anchor[1];
	const dz = z - stats.anchor[2];
	stats.weight += 1;
	stats.sumX += dx;
	stats.sumY += dy;
	stats.sumZ += dz;
	stats.sumXX += dx * dx;
	stats.sumXY += dx * dy;
	stats.sumXZ += dx * dz;
	stats.sumYY += dy * dy;
	stats.sumYZ += dy * dz;
	stats.sumZZ += dz * dz;
}
function scaleStats(stats, factor) {
	stats.weight *= factor;
	stats.sumX *= factor;
	stats.sumY *= factor;
	stats.sumZ *= factor;
	stats.sumXX *= factor;
	stats.sumXY *= factor;
	stats.sumXZ *= factor;
	stats.sumYY *= factor;
	stats.sumYZ *= factor;
	stats.sumZZ *= factor;
}
/**
* Merges `src` into `dst` in-place using the parallel-axis theorem to reconcile
* different anchor origins.
*/
function mergeStatsInto(dst, src) {
	if (src.weight <= 0) return;
	if (dst.weight <= 0) {
		dst.anchor[0] = src.anchor[0];
		dst.anchor[1] = src.anchor[1];
		dst.anchor[2] = src.anchor[2];
		dst.weight = src.weight;
		dst.sumX = src.sumX;
		dst.sumY = src.sumY;
		dst.sumZ = src.sumZ;
		dst.sumXX = src.sumXX;
		dst.sumXY = src.sumXY;
		dst.sumXZ = src.sumXZ;
		dst.sumYY = src.sumYY;
		dst.sumYZ = src.sumYZ;
		dst.sumZZ = src.sumZZ;
		return;
	}
	const sx = src.anchor[0] - dst.anchor[0];
	const sy = src.anchor[1] - dst.anchor[1];
	const sz = src.anchor[2] - dst.anchor[2];
	const w = src.weight;
	dst.weight += w;
	dst.sumX += src.sumX + w * sx;
	dst.sumY += src.sumY + w * sy;
	dst.sumZ += src.sumZ + w * sz;
	dst.sumXX += src.sumXX + 2 * sx * src.sumX + w * sx * sx;
	dst.sumYY += src.sumYY + 2 * sy * src.sumY + w * sy * sy;
	dst.sumZZ += src.sumZZ + 2 * sz * src.sumZ + w * sz * sz;
	dst.sumXY += src.sumXY + sx * src.sumY + sy * src.sumX + w * sx * sy;
	dst.sumXZ += src.sumXZ + sx * src.sumZ + sz * src.sumX + w * sx * sz;
	dst.sumYZ += src.sumYZ + sy * src.sumZ + sz * src.sumY + w * sy * sz;
}
function mergeStatsCapped(dst, src) {
	if (dst.weight + src.weight > MAX_ACCUMULATED_WEIGHT && dst.weight > 0) {
		const keepWeight = Math.max(MAX_ACCUMULATED_WEIGHT * .5, MAX_ACCUMULATED_WEIGHT - src.weight);
		if (keepWeight < dst.weight) scaleStats(dst, keepWeight / dst.weight);
	}
	mergeStatsInto(dst, src);
}
/**
* Exact 3x3 symmetric eigenvalue decomposition via cyclic Jacobi rotations.
* Returns eigenvalues sorted ascending (lambda0 <= lambda1 <= lambda2) and
* the unit eigenvector corresponding to lambda0 (plane normal).
*/
function fitPlaneFromStats(stats) {
	const w = stats.weight;
	if (w < 3) return null;
	const invW = 1 / w;
	const mx = stats.sumX * invW;
	const my = stats.sumY * invW;
	const mz = stats.sumZ * invW;
	const centroid = [
		stats.anchor[0] + mx,
		stats.anchor[1] + my,
		stats.anchor[2] + mz
	];
	let a00 = stats.sumXX * invW - mx * mx;
	let a11 = stats.sumYY * invW - my * my;
	let a22 = stats.sumZZ * invW - mz * mz;
	let a01 = stats.sumXY * invW - mx * my;
	let a02 = stats.sumXZ * invW - mx * mz;
	let a12 = stats.sumYZ * invW - my * mz;
	let v00 = 1, v01 = 0, v02 = 0;
	let v10 = 0, v11 = 1, v12 = 0;
	let v20 = 0, v21 = 0, v22 = 1;
	const scale = Math.abs(a00) + Math.abs(a11) + Math.abs(a22);
	if (scale <= 1e-12) return null;
	const eps = 1e-13 * scale;
	for (let iter = 0; iter < 18; iter++) {
		const abs01 = Math.abs(a01);
		const abs02 = Math.abs(a02);
		const abs12 = Math.abs(a12);
		if (abs01 <= eps && abs02 <= eps && abs12 <= eps) break;
		if (abs01 >= abs02 && abs01 >= abs12) {
			const tau = (a11 - a00) / (2 * a01);
			const t = tau >= 0 ? 1 / (tau + Math.sqrt(1 + tau * tau)) : -1 / (-tau + Math.sqrt(1 + tau * tau));
			const c = 1 / Math.sqrt(1 + t * t);
			const s = t * c;
			const next00 = a00 - t * a01;
			const next11 = a11 + t * a01;
			const next02 = c * a02 - s * a12;
			const next12 = s * a02 + c * a12;
			a00 = next00;
			a11 = next11;
			a01 = 0;
			a02 = next02;
			a12 = next12;
			const nv00 = c * v00 - s * v01;
			const nv01 = s * v00 + c * v01;
			const nv10 = c * v10 - s * v11;
			const nv11 = s * v10 + c * v11;
			const nv20 = c * v20 - s * v21;
			const nv21 = s * v20 + c * v21;
			v00 = nv00;
			v01 = nv01;
			v10 = nv10;
			v11 = nv11;
			v20 = nv20;
			v21 = nv21;
		} else if (abs02 >= abs12) {
			const tau = (a22 - a00) / (2 * a02);
			const t = tau >= 0 ? 1 / (tau + Math.sqrt(1 + tau * tau)) : -1 / (-tau + Math.sqrt(1 + tau * tau));
			const c = 1 / Math.sqrt(1 + t * t);
			const s = t * c;
			const next00 = a00 - t * a02;
			const next22 = a22 + t * a02;
			const next01 = c * a01 - s * a12;
			const next12 = s * a01 + c * a12;
			a00 = next00;
			a22 = next22;
			a02 = 0;
			a01 = next01;
			a12 = next12;
			const nv00 = c * v00 - s * v02;
			const nv02 = s * v00 + c * v02;
			const nv10 = c * v10 - s * v12;
			const nv12 = s * v10 + c * v12;
			const nv20 = c * v20 - s * v22;
			const nv22 = s * v20 + c * v22;
			v00 = nv00;
			v02 = nv02;
			v10 = nv10;
			v12 = nv12;
			v20 = nv20;
			v22 = nv22;
		} else {
			const tau = (a22 - a11) / (2 * a12);
			const t = tau >= 0 ? 1 / (tau + Math.sqrt(1 + tau * tau)) : -1 / (-tau + Math.sqrt(1 + tau * tau));
			const c = 1 / Math.sqrt(1 + t * t);
			const s = t * c;
			const next11 = a11 - t * a12;
			const next22 = a22 + t * a12;
			const next01 = c * a01 - s * a02;
			const next02 = s * a01 + c * a02;
			a11 = next11;
			a22 = next22;
			a12 = 0;
			a01 = next01;
			a02 = next02;
			const nv01 = c * v01 - s * v02;
			const nv02 = s * v01 + c * v02;
			const nv11 = c * v11 - s * v12;
			const nv12 = s * v11 + c * v12;
			const nv21 = c * v21 - s * v22;
			const nv22 = s * v21 + c * v22;
			v01 = nv01;
			v02 = nv02;
			v11 = nv11;
			v12 = nv12;
			v21 = nv21;
			v22 = nv22;
		}
	}
	const e0 = Math.max(0, a00);
	const e1 = Math.max(0, a11);
	const e2 = Math.max(0, a22);
	let minVal;
	let midVal;
	let maxVal;
	let nx;
	let ny;
	let nz;
	if (e0 <= e1 && e0 <= e2) {
		minVal = e0;
		nx = v00;
		ny = v10;
		nz = v20;
		if (e1 <= e2) {
			midVal = e1;
			maxVal = e2;
		} else {
			midVal = e2;
			maxVal = e1;
		}
	} else if (e1 <= e2) {
		minVal = e1;
		nx = v01;
		ny = v11;
		nz = v21;
		if (e0 <= e2) {
			midVal = e0;
			maxVal = e2;
		} else {
			midVal = e2;
			maxVal = e0;
		}
	} else {
		minVal = e2;
		nx = v02;
		ny = v12;
		nz = v22;
		if (e0 <= e1) {
			midVal = e0;
			maxVal = e1;
		} else {
			midVal = e1;
			maxVal = e0;
		}
	}
	const len = Math.hypot(nx, ny, nz);
	if (len <= 1e-12) return null;
	const invLen = 1 / len;
	return {
		centroid,
		normal: [
			nx * invLen,
			ny * invLen,
			nz * invLen
		],
		rms: Math.sqrt(minVal),
		lambda0: minVal,
		lambda1: midVal,
		lambda2: maxVal
	};
}
function rmsAlongNormal(stats, normal) {
	const w = stats.weight;
	if (w <= 0) return Infinity;
	const invW = 1 / w;
	const mx = stats.sumX * invW;
	const my = stats.sumY * invW;
	const mz = stats.sumZ * invW;
	const c00 = stats.sumXX * invW - mx * mx;
	const c11 = stats.sumYY * invW - my * my;
	const c22 = stats.sumZZ * invW - mz * mz;
	const c01 = stats.sumXY * invW - mx * my;
	const c02 = stats.sumXZ * invW - mx * mz;
	const c12 = stats.sumYZ * invW - my * mz;
	const [nx, ny, nz] = normal;
	const variance = c00 * nx * nx + c11 * ny * ny + c22 * nz * nz + 2 * (c01 * nx * ny + c02 * nx * nz + c12 * ny * nz);
	return Math.sqrt(Math.max(0, variance));
}
/**
* Snaps an approximately horizontal or vertical normal to an exact level or
* plumb plane normal so large floors, tables, and walls never drift out of
* level as they expand across frames.
*/
function classifyAndSnapNormal(rawNormal) {
	const n = normalize3(rawNormal);
	if (n[1] >= HORIZONTAL_MIN_ABS_NY) return {
		type: "horizontal",
		normal: [
			0,
			1,
			0
		]
	};
	if (n[1] <= -.94) return {
		type: "horizontal",
		normal: [
			0,
			-1,
			0
		]
	};
	if (Math.abs(n[1]) <= VERTICAL_MAX_ABS_NY) {
		const horizLen = Math.hypot(n[0], n[2]);
		if (horizLen <= 1e-6) return null;
		return {
			type: "vertical",
			normal: [
				n[0] / horizLen,
				0,
				n[2] / horizLen
			]
		};
	}
	return null;
}
function dot3(a, b) {
	return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}
function cross3(a, b) {
	return [
		a[1] * b[2] - a[2] * b[1],
		a[2] * b[0] - a[0] * b[2],
		a[0] * b[1] - a[1] * b[0]
	];
}
function normalize3(v) {
	const len = Math.hypot(v[0], v[1], v[2]);
	if (len <= 1e-12) return [
		0,
		1,
		0
	];
	return [
		v[0] / len,
		v[1] / len,
		v[2] / len
	];
}
function orientNormalToward(normal, centroid, cameraPosition) {
	const toCamX = cameraPosition[0] - centroid[0];
	const toCamY = cameraPosition[1] - centroid[1];
	const toCamZ = cameraPosition[2] - centroid[2];
	if (normal[0] * toCamX + normal[1] * toCamY + normal[2] * toCamZ < 0) return [
		-normal[0],
		-normal[1],
		-normal[2]
	];
	return [
		normal[0],
		normal[1],
		normal[2]
	];
}
/**
* Constructs a deterministic right-handed orthonormal basis `[axisX, axisY, axisZ]`
* with `axisY = normal` and `det = +1`, ensuring `axisX × axisY = axisZ`.
*/
function buildPlaneBasis(normal, type) {
	const axisY = normalize3(normal);
	let axisX;
	if (type === "horizontal") {
		const projX = [
			1 - axisY[0] * axisY[0],
			-axisY[0] * axisY[1],
			-axisY[0] * axisY[2]
		];
		if (Math.hypot(projX[0], projX[1], projX[2]) > 1e-4) axisX = normalize3(projX);
		else axisX = normalize3(cross3([
			0,
			0,
			1
		], axisY));
	} else {
		const horiz = cross3([
			0,
			1,
			0
		], axisY);
		if (Math.hypot(horiz[0], horiz[1], horiz[2]) > 1e-4) axisX = normalize3(horiz);
		else axisX = [
			1,
			0,
			0
		];
	}
	const axisZ = normalize3(cross3(axisX, axisY));
	return {
		axisX,
		axisY,
		axisZ
	};
}
/**
* Converts right-handed orthonormal basis columns `[axisX, axisY, axisZ]`
* to a unit quaternion `[x, y, z, w]` using Shepperd's method.
*/
function basisToQuaternion(axisX, axisY, axisZ) {
	const m00 = axisX[0], m10 = axisX[1], m20 = axisX[2];
	const m01 = axisY[0], m11 = axisY[1], m21 = axisY[2];
	const m02 = axisZ[0], m12 = axisZ[1], m22 = axisZ[2];
	const trace = m00 + m11 + m22;
	let qx;
	let qy;
	let qz;
	let qw;
	if (trace > 0) {
		const s = .5 / Math.sqrt(trace + 1);
		qw = .25 / s;
		qx = (m21 - m12) * s;
		qy = (m02 - m20) * s;
		qz = (m10 - m01) * s;
	} else if (m00 > m11 && m00 > m22) {
		const s = 2 * Math.sqrt(Math.max(1e-12, 1 + m00 - m11 - m22));
		qw = (m21 - m12) / s;
		qx = .25 * s;
		qy = (m01 + m10) / s;
		qz = (m02 + m20) / s;
	} else if (m11 > m22) {
		const s = 2 * Math.sqrt(Math.max(1e-12, 1 + m11 - m00 - m22));
		qw = (m02 - m20) / s;
		qx = (m01 + m10) / s;
		qy = .25 * s;
		qz = (m12 + m21) / s;
	} else {
		const s = 2 * Math.sqrt(Math.max(1e-12, 1 + m22 - m00 - m11));
		qw = (m10 - m01) / s;
		qx = (m02 + m20) / s;
		qy = (m12 + m21) / s;
		qz = .25 * s;
	}
	const len = Math.hypot(qx, qy, qz, qw);
	if (len <= 1e-12) return [
		0,
		0,
		0,
		1
	];
	const invLen = 1 / len;
	return [
		qx * invLen,
		qy * invLen,
		qz * invLen,
		qw * invLen
	];
}
/**
* Inverts a column-major 4x4 matrix; returns null if singular.
*/
function invertMatrix4(m) {
	const n11 = m[0], n21 = m[1], n31 = m[2], n41 = m[3];
	const n12 = m[4], n22 = m[5], n32 = m[6], n42 = m[7];
	const n13 = m[8], n23 = m[9], n33 = m[10], n43 = m[11];
	const n14 = m[12], n24 = m[13], n34 = m[14], n44 = m[15];
	const t11 = n23 * n34 * n42 - n24 * n33 * n42 + n24 * n32 * n43 - n22 * n34 * n43 - n23 * n32 * n44 + n22 * n33 * n44;
	const t12 = n14 * n33 * n42 - n13 * n34 * n42 - n14 * n32 * n43 + n12 * n34 * n43 + n13 * n32 * n44 - n12 * n33 * n44;
	const t13 = n13 * n24 * n42 - n14 * n23 * n42 + n14 * n22 * n43 - n12 * n24 * n43 - n13 * n22 * n44 + n12 * n23 * n44;
	const t14 = n14 * n23 * n32 - n13 * n24 * n32 - n14 * n22 * n33 + n12 * n24 * n33 + n13 * n22 * n34 - n12 * n23 * n34;
	const det = n11 * t11 + n21 * t12 + n31 * t13 + n41 * t14;
	if (!Number.isFinite(det) || Math.abs(det) < 1e-12) return null;
	const detInv = 1 / det;
	const out = /* @__PURE__ */ new Float64Array(16);
	out[0] = t11 * detInv;
	out[1] = (n24 * n33 * n41 - n23 * n34 * n41 - n24 * n31 * n43 + n21 * n34 * n43 + n23 * n31 * n44 - n21 * n33 * n44) * detInv;
	out[2] = (n22 * n34 * n41 - n24 * n32 * n41 + n24 * n31 * n42 - n21 * n34 * n42 - n22 * n31 * n44 + n21 * n32 * n44) * detInv;
	out[3] = (n23 * n32 * n41 - n22 * n33 * n41 - n23 * n31 * n42 + n21 * n33 * n42 + n22 * n31 * n43 - n21 * n32 * n43) * detInv;
	out[4] = t12 * detInv;
	out[5] = (n13 * n34 * n41 - n14 * n33 * n41 + n14 * n31 * n43 - n11 * n34 * n43 - n13 * n31 * n44 + n11 * n33 * n44) * detInv;
	out[6] = (n14 * n32 * n41 - n12 * n34 * n41 - n14 * n31 * n42 + n11 * n34 * n42 + n12 * n31 * n44 - n11 * n32 * n44) * detInv;
	out[7] = (n12 * n33 * n41 - n13 * n32 * n41 + n13 * n31 * n42 - n11 * n33 * n42 - n12 * n31 * n43 + n11 * n32 * n43) * detInv;
	out[8] = t13 * detInv;
	out[9] = (n14 * n23 * n41 - n13 * n24 * n41 - n14 * n21 * n43 + n11 * n24 * n43 + n13 * n21 * n44 - n11 * n23 * n44) * detInv;
	out[10] = (n12 * n24 * n41 - n14 * n22 * n41 + n14 * n21 * n42 - n11 * n24 * n42 - n12 * n21 * n44 + n11 * n22 * n44) * detInv;
	out[11] = (n13 * n22 * n41 - n12 * n23 * n41 - n13 * n21 * n42 + n11 * n23 * n42 + n12 * n21 * n43 - n11 * n22 * n43) * detInv;
	out[12] = t14 * detInv;
	out[13] = (n13 * n24 * n31 - n14 * n23 * n31 + n14 * n21 * n33 - n11 * n24 * n33 - n13 * n21 * n34 + n11 * n23 * n34) * detInv;
	out[14] = (n14 * n22 * n31 - n12 * n24 * n31 - n14 * n21 * n32 + n11 * n24 * n32 + n12 * n21 * n34 - n11 * n22 * n34) * detInv;
	out[15] = (n12 * n23 * n31 - n13 * n22 * n31 + n13 * n21 * n32 - n11 * n23 * n32 - n12 * n21 * n33 + n11 * n22 * n33) * detInv;
	return out;
}
function cross2D(o, a, b) {
	return (a.u - o.u) * (b.v - o.v) - (a.v - o.v) * (b.u - o.u);
}
/**
* Computes the strict 2D convex hull via Andrew's monotone chain algorithm.
* Returns vertices ordered CCW in (u, v).
*/
function computeConvexHull2D(points) {
	const n = points.length;
	if (n < 3) return [];
	const sorted = points.slice().sort((a, b) => a.u - b.u || a.v - b.v);
	const lower = [];
	for (let i = 0; i < n; i++) {
		const p = sorted[i];
		while (lower.length >= 2 && cross2D(lower[lower.length - 2], lower[lower.length - 1], p) <= 1e-10) lower.pop();
		lower.push(p);
	}
	const upper = [];
	for (let i = n - 1; i >= 0; i--) {
		const p = sorted[i];
		while (upper.length >= 2 && cross2D(upper[upper.length - 2], upper[upper.length - 1], p) <= 1e-10) upper.pop();
		upper.push(p);
	}
	lower.pop();
	upper.pop();
	const hull = lower.concat(upper);
	return hull.length >= 3 ? hull : [];
}
/**
* Simplifies a convex 2D polygon while preserving convexity and keeping at
* most `maxVertices` points.
*/
function simplifyConvexPolygon2D(hull, maxVertices, minPerpDeviation = .008) {
	const targetMax = Math.max(3, Math.floor(maxVertices));
	if (hull.length <= 3) return hull.slice();
	const verts = hull.slice();
	while (verts.length > 3) {
		let bestIdx = -1;
		let bestScore = Infinity;
		let bestHeight = Infinity;
		const len = verts.length;
		for (let i = 0; i < len; i++) {
			const prev = verts[(i + len - 1) % len];
			const curr = verts[i];
			const next = verts[(i + 1) % len];
			const area2 = Math.abs(cross2D(prev, curr, next));
			const baseLen = Math.hypot(next.u - prev.u, next.v - prev.v);
			const height = baseLen > 1e-9 ? area2 / baseLen : 0;
			const score = area2;
			if (score < bestScore) {
				bestScore = score;
				bestHeight = height;
				bestIdx = i;
			}
		}
		if (bestIdx === -1 || verts.length <= targetMax && bestHeight >= minPerpDeviation) break;
		verts.splice(bestIdx, 1);
	}
	return verts;
}
function polygonArea2D(verts) {
	const n = verts.length;
	if (n < 3) return 0;
	let sum = 0;
	for (let i = 0; i < n; i++) {
		const a = verts[i];
		const b = verts[(i + 1) % n];
		sum += a.u * b.v - b.u * a.v;
	}
	return Math.abs(sum) * .5;
}
function isPointInPolygon2D(p, poly) {
	let inside = false;
	for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
		const pi = poly[i];
		const pj = poly[j];
		if (pi.v > p.v !== pj.v > p.v && p.u < (pj.u - pi.u) * (p.v - pi.v) / (pj.v - pi.v) + pi.u) inside = !inside;
	}
	return inside;
}
function pointToSegmentDistSq2D(p, a, b) {
	const abU = b.u - a.u;
	const abV = b.v - a.v;
	const lenSq = abU * abU + abV * abV;
	if (lenSq <= 1e-12) {
		const du = p.u - a.u;
		const dv = p.v - a.v;
		return du * du + dv * dv;
	}
	const t = Math.max(0, Math.min(1, ((p.u - a.u) * abU + (p.v - a.v) * abV) / lenSq));
	const projU = a.u + t * abU;
	const projV = a.v + t * abV;
	const du = p.u - projU;
	const dv = p.v - projV;
	return du * du + dv * dv;
}
function segmentsIntersect2D(a, b, c, d) {
	const d1 = cross2D(c, d, a);
	const d2 = cross2D(c, d, b);
	const d3 = cross2D(a, b, c);
	const d4 = cross2D(a, b, d);
	if ((d1 > 0 && d2 < 0 || d1 < 0 && d2 > 0) && (d3 > 0 && d4 < 0 || d3 < 0 && d4 > 0)) return true;
	return false;
}
/**
* Exact minimum Euclidean distance between two 2D polygons (0 if overlapping).
*/
function polygonDistance2D(polyA, polyB) {
	if (polyA.length === 0 || polyB.length === 0) return Infinity;
	let minAU = Infinity, maxAU = -Infinity, minAV = Infinity, maxAV = -Infinity;
	for (let i = 0; i < polyA.length; i++) {
		const p = polyA[i];
		if (p.u < minAU) minAU = p.u;
		if (p.u > maxAU) maxAU = p.u;
		if (p.v < minAV) minAV = p.v;
		if (p.v > maxAV) maxAV = p.v;
	}
	let minBU = Infinity, maxBU = -Infinity, minBV = Infinity, maxBV = -Infinity;
	for (let i = 0; i < polyB.length; i++) {
		const p = polyB[i];
		if (p.u < minBU) minBU = p.u;
		if (p.u > maxBU) maxBU = p.u;
		if (p.v < minBV) minBV = p.v;
		if (p.v > maxBV) maxBV = p.v;
	}
	if (maxAU >= minBU && maxBU >= minAU && maxAV >= minBV && maxBV >= minAV) {
		for (let i = 0; i < polyA.length; i++) if (isPointInPolygon2D(polyA[i], polyB)) return 0;
		for (let i = 0; i < polyB.length; i++) if (isPointInPolygon2D(polyB[i], polyA)) return 0;
		for (let i = 0; i < polyA.length; i++) {
			const a0 = polyA[i];
			const a1 = polyA[(i + 1) % polyA.length];
			for (let j = 0; j < polyB.length; j++) {
				const b0 = polyB[j];
				const b1 = polyB[(j + 1) % polyB.length];
				if (segmentsIntersect2D(a0, a1, b0, b1)) return 0;
			}
		}
	}
	let minDistSq = Infinity;
	for (let i = 0; i < polyA.length; i++) {
		const p = polyA[i];
		for (let j = 0; j < polyB.length; j++) {
			const dSq = pointToSegmentDistSq2D(p, polyB[j], polyB[(j + 1) % polyB.length]);
			if (dSq < minDistSq) minDistSq = dSq;
		}
	}
	for (let i = 0; i < polyB.length; i++) {
		const p = polyB[i];
		for (let j = 0; j < polyA.length; j++) {
			const dSq = pointToSegmentDistSq2D(p, polyA[j], polyA[(j + 1) % polyA.length]);
			if (dSq < minDistSq) minDistSq = dSq;
		}
	}
	return Math.sqrt(minDistSq);
}
function projectWorldPointsTo2D(points, origin, axisX, axisZ) {
	const out = new Array(points.length);
	for (let i = 0; i < points.length; i++) {
		const p = points[i];
		const dx = p[0] - origin[0];
		const dy = p[1] - origin[1];
		const dz = p[2] - origin[2];
		out[i] = {
			u: dx * axisX[0] + dy * axisX[1] + dz * axisX[2],
			v: dx * axisZ[0] + dy * axisZ[1] + dz * axisZ[2]
		};
	}
	return out;
}
function unproject2DPointsToWorld(points, origin, axisX, axisZ) {
	const out = new Array(points.length);
	for (let i = 0; i < points.length; i++) {
		const { u, v } = points[i];
		out[i] = [
			origin[0] + u * axisX[0] + v * axisZ[0],
			origin[1] + u * axisX[1] + v * axisZ[1],
			origin[2] + u * axisX[2] + v * axisZ[2]
		];
	}
	return out;
}
function polygonsAreClose(a, b, posDeltaU, posDeltaV) {
	if (a.length !== b.length) return false;
	const vertexCount = a.length / 2;
	if (vertexCount === 0) return true;
	let bestOffset = 0;
	let bestDistSq = Infinity;
	const a0u = a[0];
	const a0v = a[1];
	for (let k = 0; k < vertexCount; k++) {
		const du = a0u - (b[k * 2] + posDeltaU);
		const dv = a0v - (b[k * 2 + 1] + posDeltaV);
		const distSq = du * du + dv * dv;
		if (distSq < bestDistSq) {
			bestDistSq = distSq;
			bestOffset = k;
		}
	}
	if (bestDistSq > SNAPSHOT_VERTEX_EPS_SQ) return false;
	for (let i = 1; i < vertexCount; i++) {
		const j = (i + bestOffset) % vertexCount;
		const du = a[i * 2] - (b[j * 2] + posDeltaU);
		const dv = a[i * 2 + 1] - (b[j * 2 + 1] + posDeltaV);
		if (du * du + dv * dv > SNAPSHOT_VERTEX_EPS_SQ) return false;
	}
	return true;
}
function resolveConfig(base, partial) {
	if (!partial) return { ...base };
	const minDepthMeters = partial.minDepthMeters !== void 0 && Number.isFinite(partial.minDepthMeters) && partial.minDepthMeters > 0 ? partial.minDepthMeters : base.minDepthMeters;
	return {
		minDepthMeters,
		maxDepthMeters: partial.maxDepthMeters !== void 0 && Number.isFinite(partial.maxDepthMeters) && partial.maxDepthMeters > minDepthMeters ? partial.maxDepthMeters : Math.max(minDepthMeters + .1, base.maxDepthMeters),
		minPlaneAreaSqMeters: partial.minPlaneAreaSqMeters !== void 0 && Number.isFinite(partial.minPlaneAreaSqMeters) && partial.minPlaneAreaSqMeters > 0 ? partial.minPlaneAreaSqMeters : base.minPlaneAreaSqMeters,
		minPlaneExtentMeters: partial.minPlaneExtentMeters !== void 0 && Number.isFinite(partial.minPlaneExtentMeters) && partial.minPlaneExtentMeters > 0 ? partial.minPlaneExtentMeters : base.minPlaneExtentMeters,
		maxTrackedPlanes: partial.maxTrackedPlanes !== void 0 && Number.isFinite(partial.maxTrackedPlanes) && partial.maxTrackedPlanes >= 1 ? Math.floor(partial.maxTrackedPlanes) : base.maxTrackedPlanes,
		maxPolygonVertices: partial.maxPolygonVertices !== void 0 && Number.isFinite(partial.maxPolygonVertices) && partial.maxPolygonVertices >= 3 ? Math.floor(partial.maxPolygonVertices) : base.maxPolygonVertices
	};
}
/**
* Pure TypeScript depth-to-plane detector and multi-frame plane tracker.
*
* Pipeline per depth frame:
* 1. Unproject valid linear view-space depth pixels into world coordinates.
* 2. Segment the organized depth image into local planar patches via 3x3 PCA.
* 3. Grow connected planar regions seeded by lowest residual with O(1) running
*    sufficient statistics, followed by 3D-continuity-guarded pixel refinement.
* 4. Reject non-planar, curved (via shape-operator curvature estimation), noisy,
*    and non-horizontal/vertical surfaces; compute 2D convex hull polygons.
* 5. Associate, grow, and consolidate tracked planes across frames with stable
*    IDs, semantic labels (`floor`, `table`, `ceiling`, `wall`), and plane caps.
*/
var DepthPlaneTracker = class {
	constructor(config) {
		this.trackedPlanes = /* @__PURE__ */ new Map();
		this.currentSceneGeneration = null;
		this.nextPlaneSequence = 0;
		this.frameCounter = 0;
		this.latestCameraY = null;
		this.cachedPixelCapacity = 0;
		this.worldPoints = /* @__PURE__ */ new Float32Array(0);
		this.validMask = /* @__PURE__ */ new Uint8Array(0);
		this.config = resolveConfig(DEFAULT_CONFIG, config);
	}
	configure(config) {
		this.config = resolveConfig(this.config, config);
		this.enforcePlaneCap();
	}
	reset(sceneGeneration) {
		this.trackedPlanes.clear();
		this.currentSceneGeneration = sceneGeneration !== void 0 ? sceneGeneration : null;
		this.frameCounter = 0;
		this.latestCameraY = null;
	}
	getTrackedPlanes() {
		const out = [];
		for (const plane of this.trackedPlanes.values()) out.push(this.toSnapshot(plane));
		return out;
	}
	processDepthFrame(frame) {
		this.validateFrame(frame);
		if (this.currentSceneGeneration !== null && frame.sceneGeneration !== this.currentSceneGeneration) this.reset(frame.sceneGeneration);
		else if (this.currentSceneGeneration === null) this.currentSceneGeneration = frame.sceneGeneration;
		this.frameCounter += 1;
		this.latestCameraY = frame.cameraPosition[1];
		if (this.unprojectDepth(frame) >= 12) {
			const candidates = this.detectPlanesInFrame(frame);
			if (candidates.length > 0) {
				const mergedCandidates = this.mergeSameFrameCandidates(candidates);
				this.updateTracks(mergedCandidates, frame.timestampMs);
				this.consolidateTracks(frame.timestampMs);
				this.updateSemanticLabels(frame.timestampMs);
				this.enforcePlaneCap();
			}
		}
		return this.getTrackedPlanes();
	}
	validateFrame(frame) {
		if (!Number.isInteger(frame.width) || !Number.isInteger(frame.height) || frame.width <= 0 || frame.height <= 0) throw new Error(`Invalid depth dimensions: ${frame.width}x${frame.height}`);
		if (!frame.depthBuffer || frame.depthBuffer.length < frame.width * frame.height) throw new Error(`Depth buffer length (${frame.depthBuffer?.length ?? 0}) is smaller than ${frame.width * frame.height}`);
		if (!frame.projectionMatrix || frame.projectionMatrix.length < 16) throw new Error("Projection matrix must have at least 16 elements");
	}
	ensurePixelBuffers(pixelCount) {
		if (pixelCount <= this.cachedPixelCapacity) return;
		this.cachedPixelCapacity = pixelCount;
		this.worldPoints = new Float32Array(pixelCount * 3);
		this.validMask = new Uint8Array(pixelCount);
	}
	unprojectDepth(frame) {
		const { width, height, depthBuffer, projectionMatrix } = frame;
		const pixelCount = width * height;
		this.ensurePixelBuffers(pixelCount);
		const minDepth = this.config.minDepthMeters;
		const maxDepth = this.config.maxDepthMeters;
		const [tx, ty, tz] = frame.cameraPosition;
		const [rawQx, rawQy, rawQz, rawQw] = frame.cameraQuaternion;
		const qLen = Math.hypot(rawQx, rawQy, rawQz, rawQw);
		const invQLen = qLen > 1e-12 ? 1 / qLen : 1;
		const qx = rawQx * invQLen;
		const qy = rawQy * invQLen;
		const qz = rawQz * invQLen;
		const qw = qLen > 1e-12 ? rawQw * invQLen : 1;
		const r00 = 1 - 2 * (qy * qy + qz * qz);
		const r01 = 2 * (qx * qy - qz * qw);
		const r02 = 2 * (qx * qz + qy * qw);
		const r10 = 2 * (qx * qy + qz * qw);
		const r11 = 1 - 2 * (qx * qx + qz * qz);
		const r12 = 2 * (qy * qz - qx * qw);
		const r20 = 2 * (qx * qz - qy * qw);
		const r21 = 2 * (qy * qz + qx * qw);
		const r22 = 1 - 2 * (qx * qx + qy * qy);
		const p0 = projectionMatrix[0];
		const p5 = projectionMatrix[5];
		const p8 = projectionMatrix[8];
		const p9 = projectionMatrix[9];
		const p11 = projectionMatrix[11];
		const p12 = projectionMatrix[12];
		const p13 = projectionMatrix[13];
		const p15 = projectionMatrix[15];
		const isStandardPerspective = Math.abs(p11 + 1) < 1e-4 && Math.abs(p0) > 1e-9 && Math.abs(p5) > 1e-9 && Math.abs(projectionMatrix[1]) < 1e-6 && Math.abs(projectionMatrix[4]) < 1e-6;
		const isOrthographic = !isStandardPerspective && Math.abs(p11) < 1e-6 && Math.abs(p15 - 1) < 1e-4 && Math.abs(p0) > 1e-9 && Math.abs(p5) > 1e-9;
		const projInv = !isStandardPerspective && !isOrthographic ? invertMatrix4(projectionMatrix) : null;
		if (!isStandardPerspective && !isOrthographic && !projInv) throw new Error("Projection matrix is singular and cannot be inverted");
		const invWidth = 1 / width;
		const invHeight = 1 / height;
		const invP0 = isStandardPerspective || isOrthographic ? 1 / p0 : 0;
		const invP5 = isStandardPerspective || isOrthographic ? 1 / p5 : 0;
		const worldPoints = this.worldPoints;
		const validMask = this.validMask;
		let validCount = 0;
		for (let py = 0; py < height; py++) {
			const ndcY = 1 - 2 * ((py + .5) * invHeight);
			const rowOffset = py * width;
			const baseRayY = isStandardPerspective ? (ndcY + p9) * invP5 : isOrthographic ? (ndcY - p13) * invP5 : 0;
			for (let px = 0; px < width; px++) {
				const idx = rowOffset + px;
				const d = depthBuffer[idx];
				if (!Number.isFinite(d) || d < minDepth || d > maxDepth) {
					validMask[idx] = 0;
					continue;
				}
				const ndcX = 2 * ((px + .5) * invWidth) - 1;
				let vx;
				let vy;
				const vz = -d;
				if (isStandardPerspective) {
					vx = (ndcX + p8) * invP0 * d;
					vy = baseRayY * d;
				} else if (isOrthographic) {
					vx = (ndcX - p12) * invP0;
					vy = baseRayY;
				} else {
					const m = projInv;
					const cx = m[0] * ndcX + m[4] * ndcY - m[8] + m[12];
					const cy = m[1] * ndcX + m[5] * ndcY - m[9] + m[13];
					const cz = m[2] * ndcX + m[6] * ndcY - m[10] + m[14];
					if (Math.abs(cz) <= 1e-12) {
						validMask[idx] = 0;
						continue;
					}
					const invNegZ = -d / cz;
					vx = cx * invNegZ;
					vy = cy * invNegZ;
				}
				const pIdx = idx * 3;
				worldPoints[pIdx] = r00 * vx + r01 * vy + r02 * vz + tx;
				worldPoints[pIdx + 1] = r10 * vx + r11 * vy + r12 * vz + ty;
				worldPoints[pIdx + 2] = r20 * vx + r21 * vy + r22 * vz + tz;
				validMask[idx] = 1;
				validCount++;
			}
		}
		return validCount;
	}
	detectPlanesInFrame(frame) {
		const { width, height, depthBuffer, cameraPosition } = frame;
		const minDim = Math.min(width, height);
		const patchSize = minDim < 48 ? 2 : minDim < 110 ? 3 : Math.min(8, Math.round(minDim / 40));
		const gridW = Math.floor(width / patchSize);
		const gridH = Math.floor(height / patchSize);
		if (gridW === 0 || gridH === 0) return [];
		const totalPatches = gridW * gridH;
		const patches = new Array(totalPatches);
		const validPatchIndices = [];
		const minPixelsPerPatch = Math.max(4, Math.ceil(patchSize * patchSize * .7));
		const worldPoints = this.worldPoints;
		const validMask = this.validMask;
		for (let gy = 0; gy < gridH; gy++) {
			const y0 = gy * patchSize;
			const y1 = Math.min(y0 + patchSize, height);
			for (let gx = 0; gx < gridW; gx++) {
				const x0 = gx * patchSize;
				const x1 = Math.min(x0 + patchSize, width);
				const patchIdx = gy * gridW + gx;
				let count = 0;
				let depthSum = 0;
				let anchorX = 0;
				let anchorY = 0;
				let anchorZ = 0;
				let stats = null;
				for (let py = y0; py < y1; py++) {
					const rowOff = py * width;
					for (let px = x0; px < x1; px++) {
						const idx = rowOff + px;
						if (validMask[idx] === 0) continue;
						const pIdx = idx * 3;
						const wx = worldPoints[pIdx];
						const wy = worldPoints[pIdx + 1];
						const wz = worldPoints[pIdx + 2];
						if (!stats) {
							anchorX = wx;
							anchorY = wy;
							anchorZ = wz;
							stats = createEmptyStats([
								anchorX,
								anchorY,
								anchorZ
							]);
						}
						addPointToStats(stats, wx, wy, wz);
						depthSum += depthBuffer[idx];
						count++;
					}
				}
				if (!stats || count < minPixelsPerPatch) {
					patches[patchIdx] = {
						gx,
						gy,
						valid: false,
						pixelCount: count,
						meanDepth: 0,
						centroid: [
							0,
							0,
							0
						],
						normal: [
							0,
							1,
							0
						],
						rms: Infinity,
						stats: stats ?? createEmptyStats([
							0,
							0,
							0
						])
					};
					continue;
				}
				const fit = fitPlaneFromStats(stats);
				const meanDepth = depthSum / count;
				const maxPatchRms = Math.min(.025, .006 + .0035 * meanDepth);
				const maxPointDist = Math.min(.045, .012 + .007 * meanDepth);
				let patchValid = false;
				let orientedNormal = [
					0,
					1,
					0
				];
				if (fit && fit.rms <= maxPatchRms && fit.lambda1 >= 1e-6 && fit.lambda0 / fit.lambda1 <= .035) {
					orientedNormal = orientNormalToward(fit.normal, fit.centroid, cameraPosition);
					const [nx, ny, nz] = orientedNormal;
					const [cx, cy, cz] = fit.centroid;
					let maxDist = 0;
					for (let py = y0; py < y1; py++) {
						const rowOff = py * width;
						for (let px = x0; px < x1; px++) {
							const idx = rowOff + px;
							if (validMask[idx] === 0) continue;
							const pIdx = idx * 3;
							const dist = Math.abs(nx * (worldPoints[pIdx] - cx) + ny * (worldPoints[pIdx + 1] - cy) + nz * (worldPoints[pIdx + 2] - cz));
							if (dist > maxDist) maxDist = dist;
						}
					}
					if (maxDist <= maxPointDist) patchValid = true;
				}
				patches[patchIdx] = {
					gx,
					gy,
					valid: patchValid,
					pixelCount: count,
					meanDepth,
					centroid: fit ? fit.centroid : [
						0,
						0,
						0
					],
					normal: orientedNormal,
					rms: fit ? fit.rms : Infinity,
					stats
				};
				if (patchValid) validPatchIndices.push(patchIdx);
			}
		}
		if (validPatchIndices.length === 0) return [];
		validPatchIndices.sort((a, b) => patches[a].rms - patches[b].rms);
		const patchRegionId = new Int32Array(totalPatches).fill(-1);
		const regions = [];
		const bfsQueue = [];
		for (let s = 0; s < validPatchIndices.length; s++) {
			const seedIdx = validPatchIndices[s];
			if (patchRegionId[seedIdx] !== -1) continue;
			const seedPatch = patches[seedIdx];
			const regionId = regions.length;
			patchRegionId[seedIdx] = regionId;
			const regionStats = cloneStats(seedPatch.stats);
			let regionNormal = [
				seedPatch.normal[0],
				seedPatch.normal[1],
				seedPatch.normal[2]
			];
			let regionCentroid = [
				seedPatch.centroid[0],
				seedPatch.centroid[1],
				seedPatch.centroid[2]
			];
			const memberPatches = [seedIdx];
			bfsQueue.length = 0;
			bfsQueue.push(seedIdx);
			let head = 0;
			while (head < bfsQueue.length) {
				const curIdx = bfsQueue[head++];
				const curPatch = patches[curIdx];
				const cgx = curPatch.gx;
				const cgy = curPatch.gy;
				const neighbors = [
					cgx > 0 ? curIdx - 1 : -1,
					cgx + 1 < gridW ? curIdx + 1 : -1,
					cgy > 0 ? curIdx - gridW : -1,
					cgy + 1 < gridH ? curIdx + gridW : -1
				];
				for (let ni = 0; ni < 4; ni++) {
					const nIdx = neighbors[ni];
					if (nIdx < 0 || patchRegionId[nIdx] !== -1) continue;
					const nPatch = patches[nIdx];
					if (!nPatch.valid) continue;
					if (dot3(nPatch.normal, regionNormal) < REGION_GROW_MIN_NORMAL_DOT) continue;
					if (Math.abs(regionNormal[0] * (nPatch.centroid[0] - regionCentroid[0]) + regionNormal[1] * (nPatch.centroid[1] - regionCentroid[1]) + regionNormal[2] * (nPatch.centroid[2] - regionCentroid[2])) > Math.min(.05, .018 + .008 * nPatch.meanDepth)) continue;
					const tentative = cloneStats(regionStats);
					mergeStatsInto(tentative, nPatch.stats);
					const nextFit = fitPlaneFromStats(tentative);
					if (!nextFit || nextFit.rms > MAX_REGION_RMS_METERS) continue;
					const nextNormal = orientNormalToward(nextFit.normal, nextFit.centroid, cameraPosition);
					if (dot3(nextNormal, seedPatch.normal) < .9) continue;
					patchRegionId[nIdx] = regionId;
					mergeStatsInto(regionStats, nPatch.stats);
					regionNormal = nextNormal;
					regionCentroid = nextFit.centroid;
					memberPatches.push(nIdx);
					bfsQueue.push(nIdx);
				}
			}
			if (memberPatches.length >= 2) regions.push({
				id: regionId,
				patchIndices: memberPatches,
				stats: regionStats,
				normal: regionNormal,
				centroid: regionCentroid
			});
		}
		if (regions.length === 0) return [];
		const pixelOwner = new Int32Array(width * height).fill(-1);
		for (let r = 0; r < regions.length; r++) {
			const region = regions[r];
			for (let i = 0; i < region.patchIndices.length; i++) {
				const p = patches[region.patchIndices[i]];
				const y0 = p.gy * patchSize;
				const y1 = Math.min(y0 + patchSize, height);
				const x0 = p.gx * patchSize;
				const x1 = Math.min(x0 + patchSize, width);
				for (let py = y0; py < y1; py++) {
					const rowOff = py * width;
					for (let px = x0; px < x1; px++) {
						const idx = rowOff + px;
						if (validMask[idx] !== 0) pixelOwner[idx] = region.id;
					}
				}
			}
		}
		const candidates = [];
		const borderPatchSet = /* @__PURE__ */ new Set();
		const pixelQueue = [];
		for (let r = 0; r < regions.length; r++) {
			const region = regions[r];
			const absNyInitial = Math.abs(region.normal[1]);
			if (absNyInitial < .8899999999999999 && absNyInitial > .22999999999999998) continue;
			borderPatchSet.clear();
			const regionPixels = [];
			pixelQueue.length = 0;
			for (let i = 0; i < region.patchIndices.length; i++) {
				const p = patches[region.patchIndices[i]];
				const y0 = p.gy * patchSize;
				const y1 = Math.min(y0 + patchSize, height);
				const x0 = p.gx * patchSize;
				const x1 = Math.min(x0 + patchSize, width);
				for (let py = y0; py < y1; py++) {
					const rowOff = py * width;
					for (let px = x0; px < x1; px++) {
						const idx = rowOff + px;
						if (pixelOwner[idx] === region.id) {
							regionPixels.push(idx);
							if (py === y0 || py === y1 - 1 || px === x0 || px === x1 - 1) pixelQueue.push(idx);
						}
					}
				}
				for (let dy = -1; dy <= 1; dy++) {
					const ngy = p.gy + dy;
					if (ngy < 0 || ngy >= gridH) continue;
					for (let dx = -1; dx <= 1; dx++) {
						const ngx = p.gx + dx;
						if (ngx < 0 || ngx >= gridW) continue;
						const nPatchIdx = ngy * gridW + ngx;
						if (patchRegionId[nPatchIdx] === -1) borderPatchSet.add(nPatchIdx);
					}
				}
			}
			const [rnx, rny, rnz] = region.normal;
			const [rcx, rcy, rcz] = region.centroid;
			let qHead = 0;
			while (qHead < pixelQueue.length) {
				const curIdx = pixelQueue[qHead++];
				const curPy = Math.floor(curIdx / width);
				const curPx = curIdx - curPy * width;
				const cOff = curIdx * 3;
				const cwx = worldPoints[cOff];
				const cwy = worldPoints[cOff + 1];
				const cwz = worldPoints[cOff + 2];
				const curDepth = depthBuffer[curIdx];
				const maxStepSq = Math.pow(Math.max(.18, .1 * curDepth), 2);
				const adj = [
					curPx > 0 ? curIdx - 1 : -1,
					curPx + 1 < width ? curIdx + 1 : -1,
					curPy > 0 ? curIdx - width : -1,
					curPy + 1 < height ? curIdx + width : -1
				];
				for (let ai = 0; ai < 4; ai++) {
					const nIdx = adj[ai];
					if (nIdx < 0 || validMask[nIdx] === 0 || pixelOwner[nIdx] !== -1) continue;
					const nPy = Math.floor(nIdx / width);
					const nPx = nIdx - nPy * width;
					const nGx = Math.min(gridW - 1, Math.floor(nPx / patchSize));
					const nPatchIdx = Math.min(gridH - 1, Math.floor(nPy / patchSize)) * gridW + nGx;
					if (!borderPatchSet.has(nPatchIdx)) continue;
					const nOff = nIdx * 3;
					const nwx = worldPoints[nOff];
					const nwy = worldPoints[nOff + 1];
					const nwz = worldPoints[nOff + 2];
					const stepDx = nwx - cwx;
					const stepDy = nwy - cwy;
					const stepDz = nwz - cwz;
					if (stepDx * stepDx + stepDy * stepDy + stepDz * stepDz > maxStepSq) continue;
					if (Math.abs(rnx * (nwx - rcx) + rny * (nwy - rcy) + rnz * (nwz - rcz)) > Math.min(.038, .014 + .006 * depthBuffer[nIdx])) continue;
					pixelOwner[nIdx] = region.id;
					regionPixels.push(nIdx);
					pixelQueue.push(nIdx);
				}
			}
			if (regionPixels.length < 12) continue;
			const firstOff = regionPixels[0] * 3;
			const finalStats = createEmptyStats([
				worldPoints[firstOff],
				worldPoints[firstOff + 1],
				worldPoints[firstOff + 2]
			]);
			for (let i = 0; i < regionPixels.length; i++) {
				const pOff = regionPixels[i] * 3;
				addPointToStats(finalStats, worldPoints[pOff], worldPoints[pOff + 1], worldPoints[pOff + 2]);
			}
			const finalFit = fitPlaneFromStats(finalStats);
			if (!finalFit || finalFit.rms > MAX_FINAL_PLANE_RMS_METERS || finalFit.lambda1 < 1e-4) continue;
			const snapped = classifyAndSnapNormal(orientNormalToward(finalFit.normal, finalFit.centroid, cameraPosition));
			if (!snapped) continue;
			const { type, normal: finalNormal } = snapped;
			if (rmsAlongNormal(finalStats, finalNormal) > MAX_FINAL_PLANE_RMS_METERS) continue;
			if (finalNormal[1] < CEILING_MAX_NY && finalFit.centroid[1] < cameraPosition[1] + MIN_CEILING_ABOVE_CAMERA_METERS) continue;
			let consistentPatches = 0;
			for (let i = 0; i < region.patchIndices.length; i++) {
				const p = patches[region.patchIndices[i]];
				if (dot3(p.normal, finalNormal) >= MIN_PATCH_NORMAL_DOT) consistentPatches++;
			}
			if (consistentPatches / region.patchIndices.length < MIN_PATCH_NORMAL_CONSISTENCY) continue;
			const { axisX, axisZ } = buildPlaneBasis(finalNormal, type);
			if (region.patchIndices.length >= 4 && this.exceedsMaxCurvature(patches, region.patchIndices, finalFit.centroid, axisX, axisZ)) continue;
			const [fcx, fcy, fcz] = finalFit.centroid;
			const projected = new Array(regionPixels.length);
			for (let i = 0; i < regionPixels.length; i++) {
				const pOff = regionPixels[i] * 3;
				const dx = worldPoints[pOff] - fcx;
				const dy = worldPoints[pOff + 1] - fcy;
				const dz = worldPoints[pOff + 2] - fcz;
				projected[i] = {
					u: dx * axisX[0] + dy * axisX[1] + dz * axisX[2],
					v: dx * axisZ[0] + dy * axisZ[1] + dz * axisZ[2]
				};
			}
			const rawHull = computeConvexHull2D(projected);
			if (rawHull.length < 3) continue;
			const area = polygonArea2D(rawHull);
			if (area < this.config.minPlaneAreaSqMeters) continue;
			let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
			for (let i = 0; i < rawHull.length; i++) {
				const pt = rawHull[i];
				if (pt.u < minU) minU = pt.u;
				if (pt.u > maxU) maxU = pt.u;
				if (pt.v < minV) minV = pt.v;
				if (pt.v > maxV) maxV = pt.v;
			}
			const extentU = maxU - minU;
			const extentV = maxV - minV;
			if (extentU < this.config.minPlaneExtentMeters || extentV < this.config.minPlaneExtentMeters) continue;
			const worldHull = unproject2DPointsToWorld(simplifyConvexPolygon2D(rawHull, INTERNAL_MAX_HULL_VERTICES), finalFit.centroid, axisX, axisZ);
			candidates.push({
				type,
				normal: finalNormal,
				centroid: finalFit.centroid,
				stats: finalStats,
				worldHull,
				area,
				extents: [extentU, extentV]
			});
		}
		return candidates;
	}
	/**
	* Estimates directional normal variation d(n)/d(t) along four tangent axes.
	* Flat planes yield ~0 even under random depth noise, whereas spheres and
	* cylinders of radius R produce curvature ~1/R.
	*/
	exceedsMaxCurvature(patches, patchIndices, centroid, axisX, axisZ) {
		const invSqrt2 = Math.SQRT1_2;
		const dirs = [
			[1, 0],
			[0, 1],
			[invSqrt2, invSqrt2],
			[invSqrt2, -invSqrt2]
		];
		for (let d = 0; d < dirs.length; d++) {
			const [du, dv] = dirs[d];
			let sumW = 0;
			let sumT2 = 0;
			let sumNtT = 0;
			for (let i = 0; i < patchIndices.length; i++) {
				const p = patches[patchIndices[i]];
				const w = p.pixelCount;
				const dx = p.centroid[0] - centroid[0];
				const dy = p.centroid[1] - centroid[1];
				const dz = p.centroid[2] - centroid[2];
				const u = dx * axisX[0] + dy * axisX[1] + dz * axisX[2];
				const v = dx * axisZ[0] + dy * axisZ[1] + dz * axisZ[2];
				const nu = dot3(p.normal, axisX);
				const nv = dot3(p.normal, axisZ);
				const t = du * u + dv * v;
				const nt = du * nu + dv * nv;
				sumW += w;
				sumT2 += w * t * t;
				sumNtT += w * nt * t;
			}
			if (sumW > 0 && sumT2 / sumW >= .003) {
				if (Math.abs(sumNtT / sumT2) > MAX_PRINCIPAL_CURVATURE) return true;
			}
		}
		return false;
	}
	mergeSameFrameCandidates(candidates) {
		if (candidates.length <= 1) return candidates;
		const active = candidates.slice().sort((a, b) => b.area - a.area);
		const merged = [];
		for (let i = 0; i < active.length; i++) {
			const cand = active[i];
			let target = null;
			for (let j = 0; j < merged.length; j++) {
				const existing = merged[j];
				if (this.areCoplanarAndNear(existing.type, existing.normal, existing.centroid, existing.worldHull, cand.type, cand.normal, cand.centroid, cand.worldHull, SAME_FRAME_MERGE_MIN_DOT, SAME_FRAME_MERGE_MAX_DIST, SAME_FRAME_MERGE_MAX_GAP)) {
					const combined = cloneStats(existing.stats);
					mergeStatsInto(combined, cand.stats);
					const fit = fitPlaneFromStats(combined);
					if (fit && fit.rms <= TRACK_MAX_MERGED_RMS) {
						target = existing;
						break;
					}
				}
			}
			if (!target) {
				merged.push(cand);
				continue;
			}
			mergeStatsInto(target.stats, cand.stats);
			const fit = fitPlaneFromStats(target.stats);
			if (fit) {
				const snapped = classifyAndSnapNormal(dot3(fit.normal, target.normal) >= 0 ? fit.normal : [
					-fit.normal[0],
					-fit.normal[1],
					-fit.normal[2]
				]);
				target.normal = snapped && snapped.type === target.type ? snapped.normal : target.normal;
				target.centroid = fit.centroid;
				const { axisX, axisZ } = buildPlaneBasis(target.normal, target.type);
				const hull2D = simplifyConvexPolygon2D(computeConvexHull2D(projectWorldPointsTo2D(target.worldHull.concat(cand.worldHull), target.centroid, axisX, axisZ)), INTERNAL_MAX_HULL_VERTICES);
				if (hull2D.length >= 3) {
					target.worldHull = unproject2DPointsToWorld(hull2D, target.centroid, axisX, axisZ);
					target.area = polygonArea2D(hull2D);
					target.extents = this.computeExtents2D(hull2D);
				}
			}
		}
		return merged;
	}
	updateTracks(candidates, timestampMs) {
		for (let i = 0; i < candidates.length; i++) {
			const cand = candidates[i];
			const matches = [];
			for (const track of this.trackedPlanes.values()) if (this.areCoplanarAndNear(track.type, track.normal, track.centroid, track.worldHull, cand.type, cand.normal, cand.centroid, cand.worldHull, TRACK_MATCH_MIN_DOT, TRACK_MATCH_MAX_PLANE_DIST, TRACK_MATCH_MAX_GAP)) {
				const checkStats = cloneStats(track.stats);
				mergeStatsCapped(checkStats, cand.stats);
				const checkFit = fitPlaneFromStats(checkStats);
				if (checkFit && checkFit.rms <= TRACK_MAX_MERGED_RMS) matches.push(track);
			}
			if (matches.length === 0) {
				this.createTrack(cand, timestampMs);
				continue;
			}
			matches.sort((a, b) => a.createdOrder - b.createdOrder);
			const primary = matches[0];
			const tentativeStats = cloneStats(primary.stats);
			mergeStatsCapped(tentativeStats, cand.stats);
			const combinedHull = primary.worldHull.concat(cand.worldHull);
			const absorbedIds = [];
			for (let m = 1; m < matches.length; m++) {
				const other = matches[m];
				const testStats = cloneStats(tentativeStats);
				mergeStatsCapped(testStats, other.stats);
				const testFit = fitPlaneFromStats(testStats);
				if (testFit && testFit.rms <= TRACK_MAX_MERGED_RMS) {
					mergeStatsCapped(tentativeStats, other.stats);
					combinedHull.push(...other.worldHull);
					absorbedIds.push(other.id);
				}
			}
			const fit = fitPlaneFromStats(tentativeStats);
			if (!fit || fit.rms > TRACK_MAX_MERGED_RMS) continue;
			for (let a = 0; a < absorbedIds.length; a++) this.trackedPlanes.delete(absorbedIds[a]);
			this.applyUpdateToTrack(primary, tentativeStats, fit, combinedHull, timestampMs, absorbedIds.length > 0);
		}
	}
	consolidateTracks(timestampMs) {
		const tracks = Array.from(this.trackedPlanes.values()).sort((a, b) => a.createdOrder - b.createdOrder);
		const removed = /* @__PURE__ */ new Set();
		for (let i = 0; i < tracks.length; i++) {
			const primary = tracks[i];
			if (removed.has(primary.id)) continue;
			for (let j = i + 1; j < tracks.length; j++) {
				const other = tracks[j];
				if (removed.has(other.id)) continue;
				if (!this.areCoplanarAndNear(primary.type, primary.normal, primary.centroid, primary.worldHull, other.type, other.normal, other.centroid, other.worldHull, TRACK_CONSOLIDATE_MIN_DOT, TRACK_CONSOLIDATE_MAX_PLANE_DIST, TRACK_CONSOLIDATE_MAX_GAP)) continue;
				const tentativeStats = cloneStats(primary.stats);
				mergeStatsCapped(tentativeStats, other.stats);
				const fit = fitPlaneFromStats(tentativeStats);
				if (!fit || fit.rms > TRACK_MAX_MERGED_RMS) continue;
				removed.add(other.id);
				this.trackedPlanes.delete(other.id);
				this.applyUpdateToTrack(primary, tentativeStats, fit, primary.worldHull.concat(other.worldHull), timestampMs, true);
			}
		}
	}
	createTrack(cand, timestampMs) {
		this.nextPlaneSequence += 1;
		const id = `plane-${this.nextPlaneSequence}`;
		const geometry = this.buildTrackGeometry(cand.type, cand.normal, cand.centroid, cand.worldHull);
		if (!geometry) return;
		const track = {
			id,
			createdOrder: this.nextPlaneSequence,
			type: cand.type,
			label: cand.type === "vertical" ? "wall" : void 0,
			normal: cand.normal,
			centroid: cand.centroid,
			stats: cloneStats(cand.stats),
			worldHull: geometry.worldHull,
			area: geometry.area,
			extents: geometry.extents,
			position: geometry.position,
			quaternion: geometry.quaternion,
			polygon: geometry.polygon,
			observationCount: 1,
			lastSeenFrame: this.frameCounter,
			lastChangedTime: timestampMs
		};
		this.trackedPlanes.set(id, track);
	}
	applyUpdateToTrack(track, newStats, fit, combinedWorldHull, timestampMs, forceGeometryChange) {
		const snapped = classifyAndSnapNormal(dot3(fit.normal, track.normal) >= 0 ? fit.normal : [
			-fit.normal[0],
			-fit.normal[1],
			-fit.normal[2]
		]);
		const newNormal = snapped && snapped.type === track.type ? snapped.normal : track.normal;
		if (rmsAlongNormal(newStats, newNormal) > TRACK_MAX_MERGED_RMS) return;
		const geometry = this.buildTrackGeometry(track.type, newNormal, fit.centroid, combinedWorldHull);
		if (!geometry) return;
		const prevPos = track.position;
		const prevNormal = track.normal;
		const prevArea = track.area;
		const prevExtents = track.extents;
		const prevPoly = track.polygon;
		const dx = geometry.position[0] - prevPos[0];
		const dy = geometry.position[1] - prevPos[1];
		const dz = geometry.position[2] - prevPos[2];
		const posMoved = dx * dx + dy * dy + dz * dz > SNAPSHOT_POS_EPS_SQ;
		const normalChanged = dot3(newNormal, prevNormal) < SNAPSHOT_NORMAL_MIN_DOT;
		const areaChanged = Math.abs(geometry.area - prevArea) > Math.max(.01, prevArea * SNAPSHOT_AREA_REL_EPS);
		const extentChanged = Math.abs(geometry.extents[0] - prevExtents[0]) > SNAPSHOT_EXTENT_EPS || Math.abs(geometry.extents[1] - prevExtents[1]) > SNAPSHOT_EXTENT_EPS;
		const { axisX, axisZ } = buildPlaneBasis(newNormal, track.type);
		const shiftU = dx * axisX[0] + dy * axisX[1] + dz * axisX[2];
		const shiftV = dx * axisZ[0] + dy * axisZ[1] + dz * axisZ[2];
		const polygonChanged = !polygonsAreClose(prevPoly, geometry.polygon, shiftU, shiftV);
		track.stats = newStats;
		track.observationCount += 1;
		track.lastSeenFrame = this.frameCounter;
		if (forceGeometryChange || posMoved || normalChanged || areaChanged || extentChanged || polygonChanged) {
			track.normal = newNormal;
			track.centroid = fit.centroid;
			track.worldHull = geometry.worldHull;
			track.area = geometry.area;
			track.extents = geometry.extents;
			track.position = geometry.position;
			track.quaternion = geometry.quaternion;
			track.polygon = geometry.polygon;
			track.lastChangedTime = timestampMs;
		}
	}
	buildTrackGeometry(type, normal, planePoint, worldPoints) {
		const { axisX, axisY, axisZ } = buildPlaneBasis(normal, type);
		const fullHull = computeConvexHull2D(projectWorldPointsTo2D(worldPoints, planePoint, axisX, axisZ));
		if (fullHull.length < 3) return null;
		const internalHull = simplifyConvexPolygon2D(fullHull, INTERNAL_MAX_HULL_VERTICES);
		const outputHull = simplifyConvexPolygon2D(internalHull, this.config.maxPolygonVertices);
		if (outputHull.length < 3) return null;
		let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
		for (let i = 0; i < outputHull.length; i++) {
			const pt = outputHull[i];
			if (pt.u < minU) minU = pt.u;
			if (pt.u > maxU) maxU = pt.u;
			if (pt.v < minV) minV = pt.v;
			if (pt.v > maxV) maxV = pt.v;
		}
		const centerU = .5 * (minU + maxU);
		const centerV = .5 * (minV + maxV);
		const position = [
			planePoint[0] + centerU * axisX[0] + centerV * axisZ[0],
			planePoint[1] + centerU * axisX[1] + centerV * axisZ[1],
			planePoint[2] + centerU * axisX[2] + centerV * axisZ[2]
		];
		const polygon = new Array(outputHull.length * 2);
		for (let i = 0; i < outputHull.length; i++) {
			const pt = outputHull[outputHull.length - 1 - i];
			polygon[i * 2] = pt.u - centerU;
			polygon[i * 2 + 1] = pt.v - centerV;
		}
		return {
			worldHull: unproject2DPointsToWorld(internalHull, planePoint, axisX, axisZ),
			position,
			quaternion: basisToQuaternion(axisX, axisY, axisZ),
			polygon,
			area: polygonArea2D(outputHull),
			extents: [maxU - minU, maxV - minV]
		};
	}
	areCoplanarAndNear(typeA, normalA, centroidA, hullA, typeB, normalB, centroidB, hullB, minNormalDot, maxPlaneDist, maxGap) {
		if (typeA !== typeB) return false;
		if (dot3(normalA, normalB) < minNormalDot) return false;
		const dx = centroidB[0] - centroidA[0];
		const dy = centroidB[1] - centroidA[1];
		const dz = centroidB[2] - centroidA[2];
		if (Math.abs(normalA[0] * dx + normalA[1] * dy + normalA[2] * dz) > maxPlaneDist) return false;
		if (Math.abs(normalB[0] * dx + normalB[1] * dy + normalB[2] * dz) > maxPlaneDist) return false;
		const { axisX, axisZ } = buildPlaneBasis(normalA, typeA);
		return polygonDistance2D(projectWorldPointsTo2D(hullA, centroidA, axisX, axisZ), projectWorldPointsTo2D(hullB, centroidA, axisX, axisZ)) <= maxGap;
	}
	updateSemanticLabels(timestampMs) {
		const upwardHorizontal = [];
		for (const track of this.trackedPlanes.values()) if (track.type === "vertical") {
			if (track.label !== "wall") {
				track.label = "wall";
				track.lastChangedTime = timestampMs;
			}
		} else if (track.normal[1] < CEILING_MAX_NY) {
			if (track.label !== "ceiling") {
				track.label = "ceiling";
				track.lastChangedTime = timestampMs;
			}
		} else upwardHorizontal.push(track);
		if (upwardHorizontal.length === 0) return;
		let minUpwardY = Infinity;
		let maxUpwardY = -Infinity;
		for (let i = 0; i < upwardHorizontal.length; i++) {
			const y = upwardHorizontal[i].position[1];
			if (y < minUpwardY) minUpwardY = y;
			if (y > maxUpwardY) maxUpwardY = y;
		}
		const camY = this.latestCameraY;
		let floorY = null;
		for (let i = 0; i < upwardHorizontal.length; i++) {
			const p = upwardHorizontal[i];
			const belowCam = camY !== null ? camY - p.position[1] : null;
			if (!(p.position[1] <= minUpwardY + .15)) continue;
			if (belowCam !== null && belowCam >= 1.15 || belowCam !== null && belowCam >= .85 && p.area >= 1.5 || maxUpwardY - minUpwardY >= .35) {
				floorY = minUpwardY;
				break;
			}
		}
		for (let i = 0; i < upwardHorizontal.length; i++) {
			const p = upwardHorizontal[i];
			const y = p.position[1];
			let nextLabel;
			if (floorY !== null) {
				const aboveFloor = y - floorY;
				if (aboveFloor <= .15) nextLabel = "floor";
				else if (aboveFloor >= .3 && aboveFloor <= 1.35 && (camY === null || y < camY + .1)) nextLabel = "table";
			} else if (camY !== null) {
				const belowCam = camY - y;
				if (belowCam >= 1.15) nextLabel = "floor";
				else if (belowCam >= .3 && belowCam < 1.15) nextLabel = "table";
			}
			if (p.label !== nextLabel) {
				p.label = nextLabel;
				p.lastChangedTime = timestampMs;
			}
		}
	}
	enforcePlaneCap() {
		const cap = this.config.maxTrackedPlanes;
		if (this.trackedPlanes.size <= cap) return;
		const ranked = Array.from(this.trackedPlanes.values()).sort((a, b) => {
			const scoreA = a.area * (1 + Math.min(a.observationCount, 10) * .2) * (a.label === "floor" ? 2 : 1);
			const scoreB = b.area * (1 + Math.min(b.observationCount, 10) * .2) * (b.label === "floor" ? 2 : 1);
			if (scoreB !== scoreA) return scoreB - scoreA;
			if (b.lastSeenFrame !== a.lastSeenFrame) return b.lastSeenFrame - a.lastSeenFrame;
			return a.createdOrder - b.createdOrder;
		});
		for (let i = cap; i < ranked.length; i++) this.trackedPlanes.delete(ranked[i].id);
	}
	computeExtents2D(points) {
		let minU = Infinity, maxU = -Infinity, minV = Infinity, maxV = -Infinity;
		for (let i = 0; i < points.length; i++) {
			const pt = points[i];
			if (pt.u < minU) minU = pt.u;
			if (pt.u > maxU) maxU = pt.u;
			if (pt.v < minV) minV = pt.v;
			if (pt.v > maxV) maxV = pt.v;
		}
		return [maxU - minU, maxV - minV];
	}
	toSnapshot(plane) {
		const snapshot = {
			id: plane.id,
			type: plane.type,
			area: plane.area,
			position: [
				plane.position[0],
				plane.position[1],
				plane.position[2]
			],
			quaternion: [
				plane.quaternion[0],
				plane.quaternion[1],
				plane.quaternion[2],
				plane.quaternion[3]
			],
			extents: [plane.extents[0], plane.extents[1]],
			polygon: plane.polygon.slice(),
			lastChangedTime: plane.lastChangedTime
		};
		if (plane.label !== void 0) snapshot.label = plane.label;
		return snapshot;
	}
};
//#endregion
//#region src/simulator/planes/SimulatorPlaneTrackingWorker.ts
function describeError(error) {
	return error instanceof Error ? error.message : String(error);
}
/**
* Creates a message handler for simulator depth-to-plane tracking worker
* requests. Separated from global worker wiring so unit tests can exercise
* the worker protocol directly without spawning a browser worker.
*/
function createPlaneTrackingWorkerHandler(host, tracker = new DepthPlaneTracker()) {
	return (message) => {
		if (!message || typeof message !== "object") {
			host.postMessage({
				type: "error",
				message: "Invalid plane tracking worker message"
			});
			return;
		}
		try {
			switch (message.type) {
				case "configure":
					tracker.configure(message.config);
					return;
				case "reset":
					tracker.reset(message.sceneGeneration);
					return;
				case "dispose":
					tracker.reset();
					host.close();
					return;
				case "processDepth": {
					const planes = tracker.processDepthFrame(message);
					host.postMessage({
						type: "planes",
						requestId: message.requestId,
						sceneGeneration: message.sceneGeneration,
						planes
					});
					return;
				}
				default: {
					const unknownType = message.type;
					host.postMessage({
						type: "error",
						message: `Unknown plane tracking worker message type: ${String(unknownType)}`
					});
					return;
				}
			}
		} catch (error) {
			if (message.type === "processDepth") host.postMessage({
				type: "error",
				requestId: message.requestId,
				sceneGeneration: message.sceneGeneration,
				message: describeError(error)
			});
			else host.postMessage({
				type: "error",
				message: describeError(error)
			});
		}
	};
}
if (typeof self !== "undefined" && typeof document === "undefined" && typeof self.postMessage === "function") {
	const worker = self;
	const handleMessage = createPlaneTrackingWorkerHandler(worker);
	worker.onmessage = (event) => {
		handleMessage(event.data);
	};
}
//#endregion
export { createPlaneTrackingWorkerHandler };

//# sourceMappingURL=SimulatorPlaneTrackingWorker.js.map