import type {
  DepthFrameInput,
  DepthPlaneTrackerConfig,
  TrackedPlaneLabel,
  TrackedPlaneOrientation,
  TrackedPlaneSnapshot,
} from './SimulatorPlaneTrackingTypes';

type Vec3 = [number, number, number];
type Quat = [number, number, number, number];

interface ResolvedTrackerConfig {
  minDepthMeters: number;
  maxDepthMeters: number;
  minPlaneAreaSqMeters: number;
  minPlaneExtentMeters: number;
  maxTrackedPlanes: number;
  maxPolygonVertices: number;
}

const DEFAULT_CONFIG: ResolvedTrackerConfig = {
  minDepthMeters: 0.2,
  maxDepthMeters: 6.0,
  minPlaneAreaSqMeters: 0.08,
  minPlaneExtentMeters: 0.2,
  maxTrackedPlanes: 48,
  maxPolygonVertices: 24,
};

// Orientation classification thresholds (right-handed Y-up).
const HORIZONTAL_MIN_ABS_NY = 0.94; // ~20 deg from horizontal
const VERTICAL_MAX_ABS_NY = 0.18; // ~10 deg from vertical
const CEILING_MAX_NY = -0.8;
const MIN_CEILING_ABOVE_CAMERA_METERS = 0.15;

// Patch & region growing thresholds.
const REGION_GROW_MIN_NORMAL_DOT = 0.935; // ~20.7 deg
const MAX_REGION_RMS_METERS = 0.026;
const MAX_FINAL_PLANE_RMS_METERS = 0.028;
const MAX_PRINCIPAL_CURVATURE = 0.28; // Rejects curved surfaces with R < ~3.5m
const MIN_PATCH_NORMAL_CONSISTENCY = 0.75;
const MIN_PATCH_NORMAL_DOT = 0.92; // ~23 deg

// Multi-frame association and merging thresholds.
const SAME_FRAME_MERGE_MIN_DOT = 0.965; // ~15 deg
const SAME_FRAME_MERGE_MAX_DIST = 0.06;
const SAME_FRAME_MERGE_MAX_GAP = 0.35;
const TRACK_MATCH_MIN_DOT = 0.95; // ~18 deg
const TRACK_MATCH_MAX_PLANE_DIST = 0.08;
const TRACK_MATCH_MAX_GAP = 0.35;
const TRACK_CONSOLIDATE_MIN_DOT = 0.965;
const TRACK_CONSOLIDATE_MAX_PLANE_DIST = 0.06;
const TRACK_CONSOLIDATE_MAX_GAP = 0.3;
const TRACK_MAX_MERGED_RMS = 0.042;
const MAX_ACCUMULATED_WEIGHT = 50000;
const INTERNAL_MAX_HULL_VERTICES = 48;

// Snapshot change detection tolerances (avoid unnecessary geometry rebuilds).
const SNAPSHOT_POS_EPS_SQ = 0.005 * 0.005;
const SNAPSHOT_NORMAL_MIN_DOT = 0.99995; // ~0.57 deg
const SNAPSHOT_EXTENT_EPS = 0.01;
const SNAPSHOT_AREA_REL_EPS = 0.015;
const SNAPSHOT_VERTEX_EPS_SQ = 0.012 * 0.012;

/**
 * Centered first- and second-order point statistics relative to `anchor`,
 * allowing O(1) exact plane merging and covariance calculation without
 * catastrophic cancellation at large world coordinates.
 */
interface PointStats {
  anchor: Vec3;
  weight: number;
  sumX: number;
  sumY: number;
  sumZ: number;
  sumXX: number;
  sumXY: number;
  sumXZ: number;
  sumYY: number;
  sumYZ: number;
  sumZZ: number;
}

interface PlaneFit {
  centroid: Vec3;
  normal: Vec3;
  rms: number;
  lambda0: number;
  lambda1: number;
  lambda2: number;
}

interface PatchInfo {
  gx: number;
  gy: number;
  valid: boolean;
  pixelCount: number;
  meanDepth: number;
  centroid: Vec3;
  normal: Vec3;
  rms: number;
  stats: PointStats;
}

interface CandidatePlane {
  type: TrackedPlaneOrientation;
  normal: Vec3;
  centroid: Vec3;
  stats: PointStats;
  /** World-space convex hull vertices lying on the fitted plane. */
  worldHull: Vec3[];
  area: number;
  extents: [number, number];
}

interface TrackedPlaneState {
  id: string;
  createdOrder: number;
  type: TrackedPlaneOrientation;
  label?: TrackedPlaneLabel;
  normal: Vec3;
  centroid: Vec3;
  stats: PointStats;
  /** World-space convex hull points retained for lossless hull union across frames. */
  worldHull: Vec3[];
  area: number;
  extents: [number, number];
  position: Vec3;
  quaternion: Quat;
  polygon: number[];
  observationCount: number;
  lastSeenFrame: number;
  lastChangedTime: number;
}

function createEmptyStats(anchor: Vec3): PointStats {
  return {
    anchor: [anchor[0], anchor[1], anchor[2]],
    weight: 0,
    sumX: 0,
    sumY: 0,
    sumZ: 0,
    sumXX: 0,
    sumXY: 0,
    sumXZ: 0,
    sumYY: 0,
    sumYZ: 0,
    sumZZ: 0,
  };
}

function cloneStats(s: PointStats): PointStats {
  return {
    anchor: [s.anchor[0], s.anchor[1], s.anchor[2]],
    weight: s.weight,
    sumX: s.sumX,
    sumY: s.sumY,
    sumZ: s.sumZ,
    sumXX: s.sumXX,
    sumXY: s.sumXY,
    sumXZ: s.sumXZ,
    sumYY: s.sumYY,
    sumYZ: s.sumYZ,
    sumZZ: s.sumZZ,
  };
}

function addPointToStats(
  stats: PointStats,
  x: number,
  y: number,
  z: number
): void {
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

function scaleStats(stats: PointStats, factor: number): void {
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
function mergeStatsInto(dst: PointStats, src: PointStats): void {
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

function mergeStatsCapped(dst: PointStats, src: PointStats): void {
  if (dst.weight + src.weight > MAX_ACCUMULATED_WEIGHT && dst.weight > 0) {
    const keepWeight = Math.max(
      MAX_ACCUMULATED_WEIGHT * 0.5,
      MAX_ACCUMULATED_WEIGHT - src.weight
    );
    if (keepWeight < dst.weight) {
      scaleStats(dst, keepWeight / dst.weight);
    }
  }
  mergeStatsInto(dst, src);
}

/**
 * Exact 3x3 symmetric eigenvalue decomposition via cyclic Jacobi rotations.
 * Returns eigenvalues sorted ascending (lambda0 <= lambda1 <= lambda2) and
 * the unit eigenvector corresponding to lambda0 (plane normal).
 */
function fitPlaneFromStats(stats: PointStats): PlaneFit | null {
  const w = stats.weight;
  if (w < 3) return null;

  const invW = 1 / w;
  const mx = stats.sumX * invW;
  const my = stats.sumY * invW;
  const mz = stats.sumZ * invW;

  const centroid: Vec3 = [
    stats.anchor[0] + mx,
    stats.anchor[1] + my,
    stats.anchor[2] + mz,
  ];

  // Symmetric 3x3 covariance matrix elements.
  let a00 = stats.sumXX * invW - mx * mx;
  let a11 = stats.sumYY * invW - my * my;
  let a22 = stats.sumZZ * invW - mz * mz;
  let a01 = stats.sumXY * invW - mx * my;
  let a02 = stats.sumXZ * invW - mx * mz;
  let a12 = stats.sumYZ * invW - my * mz;

  // Eigenvector matrix columns initialized to identity.
  let v00 = 1,
    v01 = 0,
    v02 = 0;
  let v10 = 0,
    v11 = 1,
    v12 = 0;
  let v20 = 0,
    v21 = 0,
    v22 = 1;

  const scale = Math.abs(a00) + Math.abs(a11) + Math.abs(a22);
  if (scale <= 1e-12) {
    return null;
  }
  const eps = 1e-13 * scale;

  for (let iter = 0; iter < 18; iter++) {
    const abs01 = Math.abs(a01);
    const abs02 = Math.abs(a02);
    const abs12 = Math.abs(a12);
    if (abs01 <= eps && abs02 <= eps && abs12 <= eps) {
      break;
    }

    if (abs01 >= abs02 && abs01 >= abs12) {
      const tau = (a11 - a00) / (2 * a01);
      const t =
        tau >= 0
          ? 1 / (tau + Math.sqrt(1 + tau * tau))
          : -1 / (-tau + Math.sqrt(1 + tau * tau));
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
      const t =
        tau >= 0
          ? 1 / (tau + Math.sqrt(1 + tau * tau))
          : -1 / (-tau + Math.sqrt(1 + tau * tau));
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
      const t =
        tau >= 0
          ? 1 / (tau + Math.sqrt(1 + tau * tau))
          : -1 / (-tau + Math.sqrt(1 + tau * tau));
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

  let minVal: number;
  let midVal: number;
  let maxVal: number;
  let nx: number;
  let ny: number;
  let nz: number;

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
    normal: [nx * invLen, ny * invLen, nz * invLen],
    rms: Math.sqrt(minVal),
    lambda0: minVal,
    lambda1: midVal,
    lambda2: maxVal,
  };
}

function rmsAlongNormal(stats: PointStats, normal: Vec3): number {
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
  const variance =
    c00 * nx * nx +
    c11 * ny * ny +
    c22 * nz * nz +
    2 * (c01 * nx * ny + c02 * nx * nz + c12 * ny * nz);
  return Math.sqrt(Math.max(0, variance));
}

/**
 * Snaps an approximately horizontal or vertical normal to an exact level or
 * plumb plane normal so large floors, tables, and walls never drift out of
 * level as they expand across frames.
 */
function classifyAndSnapNormal(
  rawNormal: Vec3
): {type: TrackedPlaneOrientation; normal: Vec3} | null {
  const n = normalize3(rawNormal);
  if (n[1] >= HORIZONTAL_MIN_ABS_NY) {
    return {type: 'horizontal', normal: [0, 1, 0]};
  }
  if (n[1] <= -HORIZONTAL_MIN_ABS_NY) {
    return {type: 'horizontal', normal: [0, -1, 0]};
  }
  if (Math.abs(n[1]) <= VERTICAL_MAX_ABS_NY) {
    const horizLen = Math.hypot(n[0], n[2]);
    if (horizLen <= 1e-6) return null;
    return {type: 'vertical', normal: [n[0] / horizLen, 0, n[2] / horizLen]};
  }
  return null;
}

function dot3(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross3(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function normalize3(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]);
  if (len <= 1e-12) return [0, 1, 0];
  return [v[0] / len, v[1] / len, v[2] / len];
}

function orientNormalToward(
  normal: Vec3,
  centroid: Vec3,
  cameraPosition: Vec3
): Vec3 {
  const toCamX = cameraPosition[0] - centroid[0];
  const toCamY = cameraPosition[1] - centroid[1];
  const toCamZ = cameraPosition[2] - centroid[2];
  if (normal[0] * toCamX + normal[1] * toCamY + normal[2] * toCamZ < 0) {
    return [-normal[0], -normal[1], -normal[2]];
  }
  return [normal[0], normal[1], normal[2]];
}

/**
 * Constructs a deterministic right-handed orthonormal basis `[axisX, axisY, axisZ]`
 * with `axisY = normal` and `det = +1`, ensuring `axisX × axisY = axisZ`.
 */
function buildPlaneBasis(
  normal: Vec3,
  type: TrackedPlaneOrientation
): {axisX: Vec3; axisY: Vec3; axisZ: Vec3} {
  const axisY = normalize3(normal);
  let axisX: Vec3;
  if (type === 'horizontal') {
    // Project world +X onto the plane so horizontal basis stays stable.
    const projX: Vec3 = [
      1 - axisY[0] * axisY[0],
      -axisY[0] * axisY[1],
      -axisY[0] * axisY[2],
    ];
    if (Math.hypot(projX[0], projX[1], projX[2]) > 1e-4) {
      axisX = normalize3(projX);
    } else {
      axisX = normalize3(cross3([0, 0, 1], axisY));
    }
  } else {
    // Align local +X horizontally along vertical walls.
    const horiz = cross3([0, 1, 0], axisY);
    if (Math.hypot(horiz[0], horiz[1], horiz[2]) > 1e-4) {
      axisX = normalize3(horiz);
    } else {
      axisX = [1, 0, 0];
    }
  }
  const axisZ = normalize3(cross3(axisX, axisY));
  return {axisX, axisY, axisZ};
}

/**
 * Converts right-handed orthonormal basis columns `[axisX, axisY, axisZ]`
 * to a unit quaternion `[x, y, z, w]` using Shepperd's method.
 */
function basisToQuaternion(axisX: Vec3, axisY: Vec3, axisZ: Vec3): Quat {
  const m00 = axisX[0],
    m10 = axisX[1],
    m20 = axisX[2];
  const m01 = axisY[0],
    m11 = axisY[1],
    m21 = axisY[2];
  const m02 = axisZ[0],
    m12 = axisZ[1],
    m22 = axisZ[2];

  const trace = m00 + m11 + m22;
  let qx: number;
  let qy: number;
  let qz: number;
  let qw: number;

  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    qw = 0.25 / s;
    qx = (m21 - m12) * s;
    qy = (m02 - m20) * s;
    qz = (m10 - m01) * s;
  } else if (m00 > m11 && m00 > m22) {
    const s = 2 * Math.sqrt(Math.max(1e-12, 1 + m00 - m11 - m22));
    qw = (m21 - m12) / s;
    qx = 0.25 * s;
    qy = (m01 + m10) / s;
    qz = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(Math.max(1e-12, 1 + m11 - m00 - m22));
    qw = (m02 - m20) / s;
    qx = (m01 + m10) / s;
    qy = 0.25 * s;
    qz = (m12 + m21) / s;
  } else {
    const s = 2 * Math.sqrt(Math.max(1e-12, 1 + m22 - m00 - m11));
    qw = (m10 - m01) / s;
    qx = (m02 + m20) / s;
    qy = (m12 + m21) / s;
    qz = 0.25 * s;
  }

  const len = Math.hypot(qx, qy, qz, qw);
  if (len <= 1e-12) return [0, 0, 0, 1];
  const invLen = 1 / len;
  return [qx * invLen, qy * invLen, qz * invLen, qw * invLen];
}

/**
 * Inverts a column-major 4x4 matrix; returns null if singular.
 */
function invertMatrix4(m: ArrayLike<number>): Float64Array | null {
  const n11 = m[0],
    n21 = m[1],
    n31 = m[2],
    n41 = m[3];
  const n12 = m[4],
    n22 = m[5],
    n32 = m[6],
    n42 = m[7];
  const n13 = m[8],
    n23 = m[9],
    n33 = m[10],
    n43 = m[11];
  const n14 = m[12],
    n24 = m[13],
    n34 = m[14],
    n44 = m[15];

  const t11 =
    n23 * n34 * n42 -
    n24 * n33 * n42 +
    n24 * n32 * n43 -
    n22 * n34 * n43 -
    n23 * n32 * n44 +
    n22 * n33 * n44;
  const t12 =
    n14 * n33 * n42 -
    n13 * n34 * n42 -
    n14 * n32 * n43 +
    n12 * n34 * n43 +
    n13 * n32 * n44 -
    n12 * n33 * n44;
  const t13 =
    n13 * n24 * n42 -
    n14 * n23 * n42 +
    n14 * n22 * n43 -
    n12 * n24 * n43 -
    n13 * n22 * n44 +
    n12 * n23 * n44;
  const t14 =
    n14 * n23 * n32 -
    n13 * n24 * n32 -
    n14 * n22 * n33 +
    n12 * n24 * n33 +
    n13 * n22 * n34 -
    n12 * n23 * n34;

  const det = n11 * t11 + n21 * t12 + n31 * t13 + n41 * t14;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) {
    return null;
  }

  const detInv = 1 / det;
  const out = new Float64Array(16);
  out[0] = t11 * detInv;
  out[1] =
    (n24 * n33 * n41 -
      n23 * n34 * n41 -
      n24 * n31 * n43 +
      n21 * n34 * n43 +
      n23 * n31 * n44 -
      n21 * n33 * n44) *
    detInv;
  out[2] =
    (n22 * n34 * n41 -
      n24 * n32 * n41 +
      n24 * n31 * n42 -
      n21 * n34 * n42 -
      n22 * n31 * n44 +
      n21 * n32 * n44) *
    detInv;
  out[3] =
    (n23 * n32 * n41 -
      n22 * n33 * n41 -
      n23 * n31 * n42 +
      n21 * n33 * n42 +
      n22 * n31 * n43 -
      n21 * n32 * n43) *
    detInv;

  out[4] = t12 * detInv;
  out[5] =
    (n13 * n34 * n41 -
      n14 * n33 * n41 +
      n14 * n31 * n43 -
      n11 * n34 * n43 -
      n13 * n31 * n44 +
      n11 * n33 * n44) *
    detInv;
  out[6] =
    (n14 * n32 * n41 -
      n12 * n34 * n41 -
      n14 * n31 * n42 +
      n11 * n34 * n42 +
      n12 * n31 * n44 -
      n11 * n32 * n44) *
    detInv;
  out[7] =
    (n12 * n33 * n41 -
      n13 * n32 * n41 +
      n13 * n31 * n42 -
      n11 * n33 * n42 -
      n12 * n31 * n43 +
      n11 * n32 * n43) *
    detInv;

  out[8] = t13 * detInv;
  out[9] =
    (n14 * n23 * n41 -
      n13 * n24 * n41 -
      n14 * n21 * n43 +
      n11 * n24 * n43 +
      n13 * n21 * n44 -
      n11 * n23 * n44) *
    detInv;
  out[10] =
    (n12 * n24 * n41 -
      n14 * n22 * n41 +
      n14 * n21 * n42 -
      n11 * n24 * n42 -
      n12 * n21 * n44 +
      n11 * n22 * n44) *
    detInv;
  out[11] =
    (n13 * n22 * n41 -
      n12 * n23 * n41 -
      n13 * n21 * n42 +
      n11 * n23 * n42 +
      n12 * n21 * n43 -
      n11 * n22 * n43) *
    detInv;

  out[12] = t14 * detInv;
  out[13] =
    (n13 * n24 * n31 -
      n14 * n23 * n31 +
      n14 * n21 * n33 -
      n11 * n24 * n33 -
      n13 * n21 * n34 +
      n11 * n23 * n34) *
    detInv;
  out[14] =
    (n14 * n22 * n31 -
      n12 * n24 * n31 -
      n14 * n21 * n32 +
      n11 * n24 * n32 +
      n12 * n21 * n34 -
      n11 * n22 * n34) *
    detInv;
  out[15] =
    (n12 * n23 * n31 -
      n13 * n22 * n31 +
      n13 * n21 * n32 -
      n11 * n23 * n32 -
      n12 * n21 * n33 +
      n11 * n22 * n33) *
    detInv;

  return out;
}

interface Point2D {
  u: number;
  v: number;
}

function cross2D(o: Point2D, a: Point2D, b: Point2D): number {
  return (a.u - o.u) * (b.v - o.v) - (a.v - o.v) * (b.u - o.u);
}

/**
 * Computes the strict 2D convex hull via Andrew's monotone chain algorithm.
 * Returns vertices ordered CCW in (u, v).
 */
function computeConvexHull2D(points: Point2D[]): Point2D[] {
  const n = points.length;
  if (n < 3) return [];

  const sorted = points.slice().sort((a, b) => a.u - b.u || a.v - b.v);
  const lower: Point2D[] = [];
  for (let i = 0; i < n; i++) {
    const p = sorted[i];
    while (
      lower.length >= 2 &&
      cross2D(lower[lower.length - 2], lower[lower.length - 1], p) <= 1e-10
    ) {
      lower.pop();
    }
    lower.push(p);
  }

  const upper: Point2D[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const p = sorted[i];
    while (
      upper.length >= 2 &&
      cross2D(upper[upper.length - 2], upper[upper.length - 1], p) <= 1e-10
    ) {
      upper.pop();
    }
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
function simplifyConvexPolygon2D(
  hull: Point2D[],
  maxVertices: number,
  minPerpDeviation = 0.008
): Point2D[] {
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

    if (
      bestIdx === -1 ||
      (verts.length <= targetMax && bestHeight >= minPerpDeviation)
    ) {
      break;
    }
    verts.splice(bestIdx, 1);
  }

  return verts;
}

function polygonArea2D(verts: Point2D[]): number {
  const n = verts.length;
  if (n < 3) return 0;
  let sum = 0;
  for (let i = 0; i < n; i++) {
    const a = verts[i];
    const b = verts[(i + 1) % n];
    sum += a.u * b.v - b.u * a.v;
  }
  return Math.abs(sum) * 0.5;
}

function isPointInPolygon2D(p: Point2D, poly: Point2D[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const pi = poly[i];
    const pj = poly[j];
    const intersects =
      pi.v > p.v !== pj.v > p.v &&
      p.u < ((pj.u - pi.u) * (p.v - pi.v)) / (pj.v - pi.v) + pi.u;
    if (intersects) inside = !inside;
  }
  return inside;
}

function pointToSegmentDistSq2D(p: Point2D, a: Point2D, b: Point2D): number {
  const abU = b.u - a.u;
  const abV = b.v - a.v;
  const lenSq = abU * abU + abV * abV;
  if (lenSq <= 1e-12) {
    const du = p.u - a.u;
    const dv = p.v - a.v;
    return du * du + dv * dv;
  }
  const t = Math.max(
    0,
    Math.min(1, ((p.u - a.u) * abU + (p.v - a.v) * abV) / lenSq)
  );
  const projU = a.u + t * abU;
  const projV = a.v + t * abV;
  const du = p.u - projU;
  const dv = p.v - projV;
  return du * du + dv * dv;
}

function segmentsIntersect2D(
  a: Point2D,
  b: Point2D,
  c: Point2D,
  d: Point2D
): boolean {
  const d1 = cross2D(c, d, a);
  const d2 = cross2D(c, d, b);
  const d3 = cross2D(a, b, c);
  const d4 = cross2D(a, b, d);
  if (
    ((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) &&
    ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))
  ) {
    return true;
  }
  return false;
}

/**
 * Exact minimum Euclidean distance between two 2D polygons (0 if overlapping).
 */
function polygonDistance2D(polyA: Point2D[], polyB: Point2D[]): number {
  if (polyA.length === 0 || polyB.length === 0) return Infinity;

  let minAU = Infinity,
    maxAU = -Infinity,
    minAV = Infinity,
    maxAV = -Infinity;
  for (let i = 0; i < polyA.length; i++) {
    const p = polyA[i];
    if (p.u < minAU) minAU = p.u;
    if (p.u > maxAU) maxAU = p.u;
    if (p.v < minAV) minAV = p.v;
    if (p.v > maxAV) maxAV = p.v;
  }

  let minBU = Infinity,
    maxBU = -Infinity,
    minBV = Infinity,
    maxBV = -Infinity;
  for (let i = 0; i < polyB.length; i++) {
    const p = polyB[i];
    if (p.u < minBU) minBU = p.u;
    if (p.u > maxBU) maxBU = p.u;
    if (p.v < minBV) minBV = p.v;
    if (p.v > maxBV) maxBV = p.v;
  }

  // Fast AABB lower bound check for overlap possibility.
  const aabbOverlap =
    maxAU >= minBU && maxBU >= minAU && maxAV >= minBV && maxBV >= minAV;
  if (aabbOverlap) {
    for (let i = 0; i < polyA.length; i++) {
      if (isPointInPolygon2D(polyA[i], polyB)) return 0;
    }
    for (let i = 0; i < polyB.length; i++) {
      if (isPointInPolygon2D(polyB[i], polyA)) return 0;
    }
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
      const dSq = pointToSegmentDistSq2D(
        p,
        polyB[j],
        polyB[(j + 1) % polyB.length]
      );
      if (dSq < minDistSq) minDistSq = dSq;
    }
  }
  for (let i = 0; i < polyB.length; i++) {
    const p = polyB[i];
    for (let j = 0; j < polyA.length; j++) {
      const dSq = pointToSegmentDistSq2D(
        p,
        polyA[j],
        polyA[(j + 1) % polyA.length]
      );
      if (dSq < minDistSq) minDistSq = dSq;
    }
  }

  return Math.sqrt(minDistSq);
}

function projectWorldPointsTo2D(
  points: Vec3[],
  origin: Vec3,
  axisX: Vec3,
  axisZ: Vec3
): Point2D[] {
  const out: Point2D[] = new Array(points.length);
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const dx = p[0] - origin[0];
    const dy = p[1] - origin[1];
    const dz = p[2] - origin[2];
    out[i] = {
      u: dx * axisX[0] + dy * axisX[1] + dz * axisX[2],
      v: dx * axisZ[0] + dy * axisZ[1] + dz * axisZ[2],
    };
  }
  return out;
}

function unproject2DPointsToWorld(
  points: Point2D[],
  origin: Vec3,
  axisX: Vec3,
  axisZ: Vec3
): Vec3[] {
  const out: Vec3[] = new Array(points.length);
  for (let i = 0; i < points.length; i++) {
    const {u, v} = points[i];
    out[i] = [
      origin[0] + u * axisX[0] + v * axisZ[0],
      origin[1] + u * axisX[1] + v * axisZ[1],
      origin[2] + u * axisX[2] + v * axisZ[2],
    ];
  }
  return out;
}

function polygonsAreClose(
  a: number[],
  b: number[],
  posDeltaU: number,
  posDeltaV: number
): boolean {
  if (a.length !== b.length) return false;
  const vertexCount = a.length / 2;
  if (vertexCount === 0) return true;

  // Match starting vertex against nearest vertex in `b` so cyclic shifts from
  // tiny floating-point sort ties do not trigger spurious geometry rebuilds.
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
    if (du * du + dv * dv > SNAPSHOT_VERTEX_EPS_SQ) {
      return false;
    }
  }
  return true;
}

function resolveConfig(
  base: ResolvedTrackerConfig,
  partial?: DepthPlaneTrackerConfig
): ResolvedTrackerConfig {
  if (!partial) return {...base};
  const minDepthMeters =
    partial.minDepthMeters !== undefined &&
    Number.isFinite(partial.minDepthMeters) &&
    partial.minDepthMeters > 0
      ? partial.minDepthMeters
      : base.minDepthMeters;
  const maxDepthMeters =
    partial.maxDepthMeters !== undefined &&
    Number.isFinite(partial.maxDepthMeters) &&
    partial.maxDepthMeters > minDepthMeters
      ? partial.maxDepthMeters
      : Math.max(minDepthMeters + 0.1, base.maxDepthMeters);
  const minPlaneAreaSqMeters =
    partial.minPlaneAreaSqMeters !== undefined &&
    Number.isFinite(partial.minPlaneAreaSqMeters) &&
    partial.minPlaneAreaSqMeters > 0
      ? partial.minPlaneAreaSqMeters
      : base.minPlaneAreaSqMeters;
  const minPlaneExtentMeters =
    partial.minPlaneExtentMeters !== undefined &&
    Number.isFinite(partial.minPlaneExtentMeters) &&
    partial.minPlaneExtentMeters > 0
      ? partial.minPlaneExtentMeters
      : base.minPlaneExtentMeters;
  const maxTrackedPlanes =
    partial.maxTrackedPlanes !== undefined &&
    Number.isFinite(partial.maxTrackedPlanes) &&
    partial.maxTrackedPlanes >= 1
      ? Math.floor(partial.maxTrackedPlanes)
      : base.maxTrackedPlanes;
  const maxPolygonVertices =
    partial.maxPolygonVertices !== undefined &&
    Number.isFinite(partial.maxPolygonVertices) &&
    partial.maxPolygonVertices >= 3
      ? Math.floor(partial.maxPolygonVertices)
      : base.maxPolygonVertices;

  return {
    minDepthMeters,
    maxDepthMeters,
    minPlaneAreaSqMeters,
    minPlaneExtentMeters,
    maxTrackedPlanes,
    maxPolygonVertices,
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
export class DepthPlaneTracker {
  private config: ResolvedTrackerConfig;
  private trackedPlanes = new Map<string, TrackedPlaneState>();
  private currentSceneGeneration: number | null = null;
  private nextPlaneSequence = 0;
  private frameCounter = 0;
  private latestCameraY: number | null = null;

  // Reusable per-frame unprojection buffers to reduce GC churn in the worker.
  private cachedPixelCapacity = 0;
  private worldPoints = new Float32Array(0);
  private validMask = new Uint8Array(0);

  constructor(config?: DepthPlaneTrackerConfig) {
    this.config = resolveConfig(DEFAULT_CONFIG, config);
  }

  configure(config: DepthPlaneTrackerConfig): void {
    this.config = resolveConfig(this.config, config);
    this.enforcePlaneCap();
  }

  reset(sceneGeneration?: number): void {
    this.trackedPlanes.clear();
    this.currentSceneGeneration =
      sceneGeneration !== undefined ? sceneGeneration : null;
    this.frameCounter = 0;
    this.latestCameraY = null;
  }

  getTrackedPlanes(): TrackedPlaneSnapshot[] {
    const out: TrackedPlaneSnapshot[] = [];
    for (const plane of this.trackedPlanes.values()) {
      out.push(this.toSnapshot(plane));
    }
    return out;
  }

  processDepthFrame(frame: DepthFrameInput): TrackedPlaneSnapshot[] {
    this.validateFrame(frame);

    if (
      this.currentSceneGeneration !== null &&
      frame.sceneGeneration !== this.currentSceneGeneration
    ) {
      this.reset(frame.sceneGeneration);
    } else if (this.currentSceneGeneration === null) {
      this.currentSceneGeneration = frame.sceneGeneration;
    }

    this.frameCounter += 1;
    this.latestCameraY = frame.cameraPosition[1];

    const validCount = this.unprojectDepth(frame);
    if (validCount >= 12) {
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

  private validateFrame(frame: DepthFrameInput): void {
    if (
      !Number.isInteger(frame.width) ||
      !Number.isInteger(frame.height) ||
      frame.width <= 0 ||
      frame.height <= 0
    ) {
      throw new Error(
        `Invalid depth dimensions: ${frame.width}x${frame.height}`
      );
    }
    if (
      !frame.depthBuffer ||
      frame.depthBuffer.length < frame.width * frame.height
    ) {
      throw new Error(
        `Depth buffer length (${frame.depthBuffer?.length ?? 0}) is smaller than ${frame.width * frame.height}`
      );
    }
    if (!frame.projectionMatrix || frame.projectionMatrix.length < 16) {
      throw new Error('Projection matrix must have at least 16 elements');
    }
  }

  private ensurePixelBuffers(pixelCount: number): void {
    if (pixelCount <= this.cachedPixelCapacity) return;
    this.cachedPixelCapacity = pixelCount;
    this.worldPoints = new Float32Array(pixelCount * 3);
    this.validMask = new Uint8Array(pixelCount);
  }

  private unprojectDepth(frame: DepthFrameInput): number {
    const {width, height, depthBuffer, projectionMatrix} = frame;
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

    const isStandardPerspective =
      Math.abs(p11 + 1) < 1e-4 &&
      Math.abs(p0) > 1e-9 &&
      Math.abs(p5) > 1e-9 &&
      Math.abs(projectionMatrix[1]) < 1e-6 &&
      Math.abs(projectionMatrix[4]) < 1e-6;
    const isOrthographic =
      !isStandardPerspective &&
      Math.abs(p11) < 1e-6 &&
      Math.abs(p15 - 1) < 1e-4 &&
      Math.abs(p0) > 1e-9 &&
      Math.abs(p5) > 1e-9;
    const projInv =
      !isStandardPerspective && !isOrthographic
        ? invertMatrix4(projectionMatrix)
        : null;

    if (!isStandardPerspective && !isOrthographic && !projInv) {
      throw new Error('Projection matrix is singular and cannot be inverted');
    }

    const invWidth = 1 / width;
    const invHeight = 1 / height;
    const invP0 = isStandardPerspective || isOrthographic ? 1 / p0 : 0;
    const invP5 = isStandardPerspective || isOrthographic ? 1 / p5 : 0;

    const worldPoints = this.worldPoints;
    const validMask = this.validMask;
    let validCount = 0;

    for (let py = 0; py < height; py++) {
      const ndcY = 1 - 2 * ((py + 0.5) * invHeight);
      const rowOffset = py * width;
      const baseRayY = isStandardPerspective
        ? (ndcY + p9) * invP5
        : isOrthographic
          ? (ndcY - p13) * invP5
          : 0;

      for (let px = 0; px < width; px++) {
        const idx = rowOffset + px;
        const d = depthBuffer[idx];
        if (!Number.isFinite(d) || d < minDepth || d > maxDepth) {
          validMask[idx] = 0;
          continue;
        }

        const ndcX = 2 * ((px + 0.5) * invWidth) - 1;
        let vx: number;
        let vy: number;
        const vz = -d;

        if (isStandardPerspective) {
          vx = (ndcX + p8) * invP0 * d;
          vy = baseRayY * d;
        } else if (isOrthographic) {
          vx = (ndcX - p12) * invP0;
          vy = baseRayY;
        } else {
          const m = projInv!;
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

  private detectPlanesInFrame(frame: DepthFrameInput): CandidatePlane[] {
    const {width, height, depthBuffer, cameraPosition} = frame;
    const minDim = Math.min(width, height);
    const patchSize =
      minDim < 48 ? 2 : minDim < 110 ? 3 : Math.min(8, Math.round(minDim / 40));

    const gridW = Math.floor(width / patchSize);
    const gridH = Math.floor(height / patchSize);
    if (gridW === 0 || gridH === 0) return [];

    const totalPatches = gridW * gridH;
    const patches: PatchInfo[] = new Array(totalPatches);
    const validPatchIndices: number[] = [];
    const minPixelsPerPatch = Math.max(
      4,
      Math.ceil(patchSize * patchSize * 0.7)
    );

    const worldPoints = this.worldPoints;
    const validMask = this.validMask;

    // Step 1: Fit local planar patches over the organized depth grid.
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
        let stats: PointStats | null = null;

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
              stats = createEmptyStats([anchorX, anchorY, anchorZ]);
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
            centroid: [0, 0, 0],
            normal: [0, 1, 0],
            rms: Infinity,
            stats: stats ?? createEmptyStats([0, 0, 0]),
          };
          continue;
        }

        const fit = fitPlaneFromStats(stats);
        const meanDepth = depthSum / count;
        const maxPatchRms = Math.min(0.025, 0.006 + 0.0035 * meanDepth);
        const maxPointDist = Math.min(0.045, 0.012 + 0.007 * meanDepth);

        let patchValid = false;
        let orientedNormal: Vec3 = [0, 1, 0];

        if (
          fit &&
          fit.rms <= maxPatchRms &&
          fit.lambda1 >= 1e-6 &&
          fit.lambda0 / fit.lambda1 <= 0.035
        ) {
          orientedNormal = orientNormalToward(
            fit.normal,
            fit.centroid,
            cameraPosition
          );
          const [nx, ny, nz] = orientedNormal;
          const [cx, cy, cz] = fit.centroid;
          let maxDist = 0;
          for (let py = y0; py < y1; py++) {
            const rowOff = py * width;
            for (let px = x0; px < x1; px++) {
              const idx = rowOff + px;
              if (validMask[idx] === 0) continue;
              const pIdx = idx * 3;
              const dist = Math.abs(
                nx * (worldPoints[pIdx] - cx) +
                  ny * (worldPoints[pIdx + 1] - cy) +
                  nz * (worldPoints[pIdx + 2] - cz)
              );
              if (dist > maxDist) maxDist = dist;
            }
          }
          if (maxDist <= maxPointDist) {
            patchValid = true;
          }
        }

        patches[patchIdx] = {
          gx,
          gy,
          valid: patchValid,
          pixelCount: count,
          meanDepth,
          centroid: fit ? fit.centroid : [0, 0, 0],
          normal: orientedNormal,
          rms: fit ? fit.rms : Infinity,
          stats,
        };

        if (patchValid) {
          validPatchIndices.push(patchIdx);
        }
      }
    }

    if (validPatchIndices.length === 0) return [];

    // Seed region growing from the flattest patches first.
    validPatchIndices.sort((a, b) => patches[a].rms - patches[b].rms);

    // Step 2: Connected-patch region growing with O(1) running PCA stats.
    const patchRegionId = new Int32Array(totalPatches).fill(-1);
    const regions: {
      id: number;
      patchIndices: number[];
      stats: PointStats;
      normal: Vec3;
      centroid: Vec3;
    }[] = [];
    const bfsQueue: number[] = [];

    for (let s = 0; s < validPatchIndices.length; s++) {
      const seedIdx = validPatchIndices[s];
      if (patchRegionId[seedIdx] !== -1) continue;

      const seedPatch = patches[seedIdx];
      const regionId = regions.length;
      patchRegionId[seedIdx] = regionId;

      const regionStats = cloneStats(seedPatch.stats);
      let regionNormal: Vec3 = [
        seedPatch.normal[0],
        seedPatch.normal[1],
        seedPatch.normal[2],
      ];
      let regionCentroid: Vec3 = [
        seedPatch.centroid[0],
        seedPatch.centroid[1],
        seedPatch.centroid[2],
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
          cgy + 1 < gridH ? curIdx + gridW : -1,
        ];

        for (let ni = 0; ni < 4; ni++) {
          const nIdx = neighbors[ni];
          if (nIdx < 0 || patchRegionId[nIdx] !== -1) continue;
          const nPatch = patches[nIdx];
          if (!nPatch.valid) continue;

          if (dot3(nPatch.normal, regionNormal) < REGION_GROW_MIN_NORMAL_DOT) {
            continue;
          }

          const planeDist = Math.abs(
            regionNormal[0] * (nPatch.centroid[0] - regionCentroid[0]) +
              regionNormal[1] * (nPatch.centroid[1] - regionCentroid[1]) +
              regionNormal[2] * (nPatch.centroid[2] - regionCentroid[2])
          );
          const maxPlaneDist = Math.min(0.05, 0.018 + 0.008 * nPatch.meanDepth);
          if (planeDist > maxPlaneDist) continue;

          const tentative = cloneStats(regionStats);
          mergeStatsInto(tentative, nPatch.stats);
          const nextFit = fitPlaneFromStats(tentative);
          if (!nextFit || nextFit.rms > MAX_REGION_RMS_METERS) continue;

          const nextNormal = orientNormalToward(
            nextFit.normal,
            nextFit.centroid,
            cameraPosition
          );
          if (dot3(nextNormal, seedPatch.normal) < 0.9) continue;

          patchRegionId[nIdx] = regionId;
          mergeStatsInto(regionStats, nPatch.stats);
          regionNormal = nextNormal;
          regionCentroid = nextFit.centroid;
          memberPatches.push(nIdx);
          bfsQueue.push(nIdx);
        }
      }

      if (memberPatches.length >= 2) {
        regions.push({
          id: regionId,
          patchIndices: memberPatches,
          stats: regionStats,
          normal: regionNormal,
          centroid: regionCentroid,
        });
      }
    }

    if (regions.length === 0) return [];

    // Step 3: Pixel-level boundary refinement, planarity/curvature validation,
    // orientation classification, and 2D convex hull polygon fitting.
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
            if (validMask[idx] !== 0) {
              pixelOwner[idx] = region.id;
            }
          }
        }
      }
    }

    const candidates: CandidatePlane[] = [];
    const borderPatchSet = new Set<number>();
    const pixelQueue: number[] = [];

    for (let r = 0; r < regions.length; r++) {
      const region = regions[r];
      const absNyInitial = Math.abs(region.normal[1]);
      if (
        absNyInitial < HORIZONTAL_MIN_ABS_NY - 0.05 &&
        absNyInitial > VERTICAL_MAX_ABS_NY + 0.05
      ) {
        continue;
      }

      // Expand into 1-ring neighboring boundary pixels while enforcing both
      // plane distance and 3D step continuity (prevents bleeding across
      // depth discontinuities into background surfaces at the same plane level).
      borderPatchSet.clear();
      const regionPixels: number[] = [];
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
              if (py === y0 || py === y1 - 1 || px === x0 || px === x1 - 1) {
                pixelQueue.push(idx);
              }
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
            if (patchRegionId[nPatchIdx] === -1) {
              borderPatchSet.add(nPatchIdx);
            }
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
        const maxStepSq = Math.pow(Math.max(0.18, 0.1 * curDepth), 2);

        const adj = [
          curPx > 0 ? curIdx - 1 : -1,
          curPx + 1 < width ? curIdx + 1 : -1,
          curPy > 0 ? curIdx - width : -1,
          curPy + 1 < height ? curIdx + width : -1,
        ];

        for (let ai = 0; ai < 4; ai++) {
          const nIdx = adj[ai];
          if (nIdx < 0 || validMask[nIdx] === 0 || pixelOwner[nIdx] !== -1) {
            continue;
          }
          const nPy = Math.floor(nIdx / width);
          const nPx = nIdx - nPy * width;
          const nGx = Math.min(gridW - 1, Math.floor(nPx / patchSize));
          const nGy = Math.min(gridH - 1, Math.floor(nPy / patchSize));
          const nPatchIdx = nGy * gridW + nGx;
          if (!borderPatchSet.has(nPatchIdx)) continue;

          const nOff = nIdx * 3;
          const nwx = worldPoints[nOff];
          const nwy = worldPoints[nOff + 1];
          const nwz = worldPoints[nOff + 2];

          const stepDx = nwx - cwx;
          const stepDy = nwy - cwy;
          const stepDz = nwz - cwz;
          if (stepDx * stepDx + stepDy * stepDy + stepDz * stepDz > maxStepSq) {
            continue;
          }

          const planeDist = Math.abs(
            rnx * (nwx - rcx) + rny * (nwy - rcy) + rnz * (nwz - rcz)
          );
          const maxPixelDist = Math.min(
            0.038,
            0.014 + 0.006 * depthBuffer[nIdx]
          );
          if (planeDist > maxPixelDist) continue;

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
        worldPoints[firstOff + 2],
      ]);
      for (let i = 0; i < regionPixels.length; i++) {
        const pOff = regionPixels[i] * 3;
        addPointToStats(
          finalStats,
          worldPoints[pOff],
          worldPoints[pOff + 1],
          worldPoints[pOff + 2]
        );
      }

      const finalFit = fitPlaneFromStats(finalStats);
      if (
        !finalFit ||
        finalFit.rms > MAX_FINAL_PLANE_RMS_METERS ||
        finalFit.lambda1 < 1e-4
      ) {
        continue;
      }

      const rawNormal = orientNormalToward(
        finalFit.normal,
        finalFit.centroid,
        cameraPosition
      );

      // Classify orientation and snap to exact horizontal/vertical normals;
      // verify points still fit the snapped plane tightly so subtly sloped
      // ramps and slanted furniture are rejected.
      const snapped = classifyAndSnapNormal(rawNormal);
      if (!snapped) {
        continue;
      }
      const {type, normal: finalNormal} = snapped;
      if (
        rmsAlongNormal(finalStats, finalNormal) > MAX_FINAL_PLANE_RMS_METERS
      ) {
        continue;
      }
      // Reject downward-facing undersides below eye height (e.g. table undersides).
      if (
        finalNormal[1] < CEILING_MAX_NY &&
        finalFit.centroid[1] <
          cameraPosition[1] + MIN_CEILING_ABOVE_CAMERA_METERS
      ) {
        continue;
      }

      // Check local patch normal consistency against the final fitted normal.
      let consistentPatches = 0;
      for (let i = 0; i < region.patchIndices.length; i++) {
        const p = patches[region.patchIndices[i]];
        if (dot3(p.normal, finalNormal) >= MIN_PATCH_NORMAL_DOT) {
          consistentPatches++;
        }
      }
      if (
        consistentPatches / region.patchIndices.length <
        MIN_PATCH_NORMAL_CONSISTENCY
      ) {
        continue;
      }

      const {axisX, axisZ} = buildPlaneBasis(finalNormal, type);

      // Curvature check across 4 tangent directions (0, 45, 90, 135 deg) to
      // reject cylinders, spheres, and gently curved meshes at any orientation.
      if (
        region.patchIndices.length >= 4 &&
        this.exceedsMaxCurvature(
          patches,
          region.patchIndices,
          finalFit.centroid,
          axisX,
          axisZ
        )
      ) {
        continue;
      }

      // Project inliers onto plane coordinates and compute 2D convex hull.
      const [fcx, fcy, fcz] = finalFit.centroid;
      const projected: Point2D[] = new Array(regionPixels.length);
      for (let i = 0; i < regionPixels.length; i++) {
        const pOff = regionPixels[i] * 3;
        const dx = worldPoints[pOff] - fcx;
        const dy = worldPoints[pOff + 1] - fcy;
        const dz = worldPoints[pOff + 2] - fcz;
        projected[i] = {
          u: dx * axisX[0] + dy * axisX[1] + dz * axisX[2],
          v: dx * axisZ[0] + dy * axisZ[1] + dz * axisZ[2],
        };
      }

      const rawHull = computeConvexHull2D(projected);
      if (rawHull.length < 3) continue;

      const area = polygonArea2D(rawHull);
      if (area < this.config.minPlaneAreaSqMeters) continue;

      let minU = Infinity,
        maxU = -Infinity,
        minV = Infinity,
        maxV = -Infinity;
      for (let i = 0; i < rawHull.length; i++) {
        const pt = rawHull[i];
        if (pt.u < minU) minU = pt.u;
        if (pt.u > maxU) maxU = pt.u;
        if (pt.v < minV) minV = pt.v;
        if (pt.v > maxV) maxV = pt.v;
      }
      const extentU = maxU - minU;
      const extentV = maxV - minV;
      if (
        extentU < this.config.minPlaneExtentMeters ||
        extentV < this.config.minPlaneExtentMeters
      ) {
        continue;
      }

      const simplifiedHull = simplifyConvexPolygon2D(
        rawHull,
        INTERNAL_MAX_HULL_VERTICES
      );
      const worldHull = unproject2DPointsToWorld(
        simplifiedHull,
        finalFit.centroid,
        axisX,
        axisZ
      );

      candidates.push({
        type,
        normal: finalNormal,
        centroid: finalFit.centroid,
        stats: finalStats,
        worldHull,
        area,
        extents: [extentU, extentV],
      });
    }

    return candidates;
  }

  /**
   * Estimates directional normal variation d(n)/d(t) along four tangent axes.
   * Flat planes yield ~0 even under random depth noise, whereas spheres and
   * cylinders of radius R produce curvature ~1/R.
   */
  private exceedsMaxCurvature(
    patches: PatchInfo[],
    patchIndices: number[],
    centroid: Vec3,
    axisX: Vec3,
    axisZ: Vec3
  ): boolean {
    const invSqrt2 = Math.SQRT1_2;
    const dirs: [number, number][] = [
      [1, 0],
      [0, 1],
      [invSqrt2, invSqrt2],
      [invSqrt2, -invSqrt2],
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

      if (sumW > 0 && sumT2 / sumW >= 0.003) {
        const curvature = Math.abs(sumNtT / sumT2);
        if (curvature > MAX_PRINCIPAL_CURVATURE) {
          return true;
        }
      }
    }

    return false;
  }

  private mergeSameFrameCandidates(
    candidates: CandidatePlane[]
  ): CandidatePlane[] {
    if (candidates.length <= 1) return candidates;
    const active = candidates.slice().sort((a, b) => b.area - a.area);
    const merged: CandidatePlane[] = [];

    for (let i = 0; i < active.length; i++) {
      const cand = active[i];
      let target: CandidatePlane | null = null;

      for (let j = 0; j < merged.length; j++) {
        const existing = merged[j];
        if (
          this.areCoplanarAndNear(
            existing.type,
            existing.normal,
            existing.centroid,
            existing.worldHull,
            cand.type,
            cand.normal,
            cand.centroid,
            cand.worldHull,
            SAME_FRAME_MERGE_MIN_DOT,
            SAME_FRAME_MERGE_MAX_DIST,
            SAME_FRAME_MERGE_MAX_GAP
          )
        ) {
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
        const alignedNormal: Vec3 =
          dot3(fit.normal, target.normal) >= 0
            ? fit.normal
            : [-fit.normal[0], -fit.normal[1], -fit.normal[2]];
        const snapped = classifyAndSnapNormal(alignedNormal);
        target.normal =
          snapped && snapped.type === target.type
            ? snapped.normal
            : target.normal;
        target.centroid = fit.centroid;
        const {axisX, axisZ} = buildPlaneBasis(target.normal, target.type);
        const pts2D = projectWorldPointsTo2D(
          target.worldHull.concat(cand.worldHull),
          target.centroid,
          axisX,
          axisZ
        );
        const hull2D = simplifyConvexPolygon2D(
          computeConvexHull2D(pts2D),
          INTERNAL_MAX_HULL_VERTICES
        );
        if (hull2D.length >= 3) {
          target.worldHull = unproject2DPointsToWorld(
            hull2D,
            target.centroid,
            axisX,
            axisZ
          );
          target.area = polygonArea2D(hull2D);
          target.extents = this.computeExtents2D(hull2D);
        }
      }
    }

    return merged;
  }

  private updateTracks(
    candidates: CandidatePlane[],
    timestampMs: number
  ): void {
    for (let i = 0; i < candidates.length; i++) {
      const cand = candidates[i];
      const matches: TrackedPlaneState[] = [];

      for (const track of this.trackedPlanes.values()) {
        if (
          this.areCoplanarAndNear(
            track.type,
            track.normal,
            track.centroid,
            track.worldHull,
            cand.type,
            cand.normal,
            cand.centroid,
            cand.worldHull,
            TRACK_MATCH_MIN_DOT,
            TRACK_MATCH_MAX_PLANE_DIST,
            TRACK_MATCH_MAX_GAP
          )
        ) {
          const checkStats = cloneStats(track.stats);
          mergeStatsCapped(checkStats, cand.stats);
          const checkFit = fitPlaneFromStats(checkStats);
          if (checkFit && checkFit.rms <= TRACK_MAX_MERGED_RMS) {
            matches.push(track);
          }
        }
      }

      if (matches.length === 0) {
        this.createTrack(cand, timestampMs);
        continue;
      }

      // Preserve the oldest matched plane's ID when a new observation bridges
      // two previously disjoint fragments of the same physical surface.
      matches.sort((a, b) => a.createdOrder - b.createdOrder);
      const primary = matches[0];

      const tentativeStats = cloneStats(primary.stats);
      mergeStatsCapped(tentativeStats, cand.stats);
      const combinedHull = primary.worldHull.concat(cand.worldHull);
      const absorbedIds: string[] = [];

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
      if (!fit || fit.rms > TRACK_MAX_MERGED_RMS) {
        continue;
      }

      for (let a = 0; a < absorbedIds.length; a++) {
        this.trackedPlanes.delete(absorbedIds[a]);
      }

      this.applyUpdateToTrack(
        primary,
        tentativeStats,
        fit,
        combinedHull,
        timestampMs,
        absorbedIds.length > 0
      );
    }
  }

  private consolidateTracks(timestampMs: number): void {
    const tracks = Array.from(this.trackedPlanes.values()).sort(
      (a, b) => a.createdOrder - b.createdOrder
    );
    const removed = new Set<string>();

    for (let i = 0; i < tracks.length; i++) {
      const primary = tracks[i];
      if (removed.has(primary.id)) continue;

      for (let j = i + 1; j < tracks.length; j++) {
        const other = tracks[j];
        if (removed.has(other.id)) continue;

        if (
          !this.areCoplanarAndNear(
            primary.type,
            primary.normal,
            primary.centroid,
            primary.worldHull,
            other.type,
            other.normal,
            other.centroid,
            other.worldHull,
            TRACK_CONSOLIDATE_MIN_DOT,
            TRACK_CONSOLIDATE_MAX_PLANE_DIST,
            TRACK_CONSOLIDATE_MAX_GAP
          )
        ) {
          continue;
        }

        const tentativeStats = cloneStats(primary.stats);
        mergeStatsCapped(tentativeStats, other.stats);
        const fit = fitPlaneFromStats(tentativeStats);
        if (!fit || fit.rms > TRACK_MAX_MERGED_RMS) continue;

        removed.add(other.id);
        this.trackedPlanes.delete(other.id);
        this.applyUpdateToTrack(
          primary,
          tentativeStats,
          fit,
          primary.worldHull.concat(other.worldHull),
          timestampMs,
          true
        );
      }
    }
  }

  private createTrack(cand: CandidatePlane, timestampMs: number): void {
    this.nextPlaneSequence += 1;
    const id = `plane-${this.nextPlaneSequence}`;
    const geometry = this.buildTrackGeometry(
      cand.type,
      cand.normal,
      cand.centroid,
      cand.worldHull
    );
    if (!geometry) return;

    const track: TrackedPlaneState = {
      id,
      createdOrder: this.nextPlaneSequence,
      type: cand.type,
      label: cand.type === 'vertical' ? 'wall' : undefined,
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
      lastChangedTime: timestampMs,
    };

    this.trackedPlanes.set(id, track);
  }

  private applyUpdateToTrack(
    track: TrackedPlaneState,
    newStats: PointStats,
    fit: PlaneFit,
    combinedWorldHull: Vec3[],
    timestampMs: number,
    forceGeometryChange: boolean
  ): void {
    const alignedFitNormal: Vec3 =
      dot3(fit.normal, track.normal) >= 0
        ? fit.normal
        : [-fit.normal[0], -fit.normal[1], -fit.normal[2]];
    const snapped = classifyAndSnapNormal(alignedFitNormal);
    const newNormal: Vec3 =
      snapped && snapped.type === track.type ? snapped.normal : track.normal;
    if (rmsAlongNormal(newStats, newNormal) > TRACK_MAX_MERGED_RMS) {
      return;
    }

    const geometry = this.buildTrackGeometry(
      track.type,
      newNormal,
      fit.centroid,
      combinedWorldHull
    );
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
    const areaChanged =
      Math.abs(geometry.area - prevArea) >
      Math.max(0.01, prevArea * SNAPSHOT_AREA_REL_EPS);
    const extentChanged =
      Math.abs(geometry.extents[0] - prevExtents[0]) > SNAPSHOT_EXTENT_EPS ||
      Math.abs(geometry.extents[1] - prevExtents[1]) > SNAPSHOT_EXTENT_EPS;

    const {axisX, axisZ} = buildPlaneBasis(newNormal, track.type);
    const shiftU = dx * axisX[0] + dy * axisX[1] + dz * axisX[2];
    const shiftV = dx * axisZ[0] + dy * axisZ[1] + dz * axisZ[2];
    const polygonChanged = !polygonsAreClose(
      prevPoly,
      geometry.polygon,
      shiftU,
      shiftV
    );

    track.stats = newStats;
    track.observationCount += 1;
    track.lastSeenFrame = this.frameCounter;

    if (
      forceGeometryChange ||
      posMoved ||
      normalChanged ||
      areaChanged ||
      extentChanged ||
      polygonChanged
    ) {
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

  private buildTrackGeometry(
    type: TrackedPlaneOrientation,
    normal: Vec3,
    planePoint: Vec3,
    worldPoints: Vec3[]
  ): {
    worldHull: Vec3[];
    position: Vec3;
    quaternion: Quat;
    polygon: number[];
    area: number;
    extents: [number, number];
  } | null {
    const {axisX, axisY, axisZ} = buildPlaneBasis(normal, type);
    const pts2D = projectWorldPointsTo2D(worldPoints, planePoint, axisX, axisZ);
    const fullHull = computeConvexHull2D(pts2D);
    if (fullHull.length < 3) return null;

    const internalHull = simplifyConvexPolygon2D(
      fullHull,
      INTERNAL_MAX_HULL_VERTICES
    );
    const outputHull = simplifyConvexPolygon2D(
      internalHull,
      this.config.maxPolygonVertices
    );
    if (outputHull.length < 3) return null;

    let minU = Infinity,
      maxU = -Infinity,
      minV = Infinity,
      maxV = -Infinity;
    for (let i = 0; i < outputHull.length; i++) {
      const pt = outputHull[i];
      if (pt.u < minU) minU = pt.u;
      if (pt.u > maxU) maxU = pt.u;
      if (pt.v < minV) minV = pt.v;
      if (pt.v > maxV) maxV = pt.v;
    }

    const centerU = 0.5 * (minU + maxU);
    const centerV = 0.5 * (minV + maxV);
    const position: Vec3 = [
      planePoint[0] + centerU * axisX[0] + centerV * axisZ[0],
      planePoint[1] + centerU * axisX[1] + centerV * axisZ[1],
      planePoint[2] + centerU * axisX[2] + centerV * axisZ[2],
    ];

    // Emit vertices in CCW order when viewed from +Y (WebXR convention),
    // which is the reverse of CCW in (u, v) where +X cross +Y = +Z.
    const polygon: number[] = new Array(outputHull.length * 2);
    for (let i = 0; i < outputHull.length; i++) {
      const pt = outputHull[outputHull.length - 1 - i];
      polygon[i * 2] = pt.u - centerU;
      polygon[i * 2 + 1] = pt.v - centerV;
    }

    const worldHull = unproject2DPointsToWorld(
      internalHull,
      planePoint,
      axisX,
      axisZ
    );

    return {
      worldHull,
      position,
      quaternion: basisToQuaternion(axisX, axisY, axisZ),
      polygon,
      area: polygonArea2D(outputHull),
      extents: [maxU - minU, maxV - minV],
    };
  }

  private areCoplanarAndNear(
    typeA: TrackedPlaneOrientation,
    normalA: Vec3,
    centroidA: Vec3,
    hullA: Vec3[],
    typeB: TrackedPlaneOrientation,
    normalB: Vec3,
    centroidB: Vec3,
    hullB: Vec3[],
    minNormalDot: number,
    maxPlaneDist: number,
    maxGap: number
  ): boolean {
    if (typeA !== typeB) return false;
    if (dot3(normalA, normalB) < minNormalDot) return false;

    const dx = centroidB[0] - centroidA[0];
    const dy = centroidB[1] - centroidA[1];
    const dz = centroidB[2] - centroidA[2];
    const distAB = Math.abs(
      normalA[0] * dx + normalA[1] * dy + normalA[2] * dz
    );
    if (distAB > maxPlaneDist) return false;
    const distBA = Math.abs(
      normalB[0] * dx + normalB[1] * dy + normalB[2] * dz
    );
    if (distBA > maxPlaneDist) return false;

    const {axisX, axisZ} = buildPlaneBasis(normalA, typeA);
    const polyA = projectWorldPointsTo2D(hullA, centroidA, axisX, axisZ);
    const polyB = projectWorldPointsTo2D(hullB, centroidA, axisX, axisZ);
    return polygonDistance2D(polyA, polyB) <= maxGap;
  }

  private updateSemanticLabels(timestampMs: number): void {
    const upwardHorizontal: TrackedPlaneState[] = [];

    for (const track of this.trackedPlanes.values()) {
      if (track.type === 'vertical') {
        if (track.label !== 'wall') {
          track.label = 'wall';
          track.lastChangedTime = timestampMs;
        }
      } else if (track.normal[1] < CEILING_MAX_NY) {
        if (track.label !== 'ceiling') {
          track.label = 'ceiling';
          track.lastChangedTime = timestampMs;
        }
      } else {
        upwardHorizontal.push(track);
      }
    }

    if (upwardHorizontal.length === 0) return;

    // Identify a reference floor elevation from the lowest upward plane(s)
    // that are plausibly at floor height below the observing camera.
    let minUpwardY = Infinity;
    let maxUpwardY = -Infinity;
    for (let i = 0; i < upwardHorizontal.length; i++) {
      const y = upwardHorizontal[i].position[1];
      if (y < minUpwardY) minUpwardY = y;
      if (y > maxUpwardY) maxUpwardY = y;
    }

    const camY = this.latestCameraY;
    let floorY: number | null = null;
    for (let i = 0; i < upwardHorizontal.length; i++) {
      const p = upwardHorizontal[i];
      const belowCam = camY !== null ? camY - p.position[1] : null;
      const isLowestBand = p.position[1] <= minUpwardY + 0.15;
      if (!isLowestBand) continue;
      if (
        (belowCam !== null && belowCam >= 1.15) ||
        (belowCam !== null && belowCam >= 0.85 && p.area >= 1.5) ||
        maxUpwardY - minUpwardY >= 0.35
      ) {
        floorY = minUpwardY;
        break;
      }
    }

    for (let i = 0; i < upwardHorizontal.length; i++) {
      const p = upwardHorizontal[i];
      const y = p.position[1];
      let nextLabel: TrackedPlaneLabel | undefined;

      if (floorY !== null) {
        const aboveFloor = y - floorY;
        if (aboveFloor <= 0.15) {
          nextLabel = 'floor';
        } else if (
          aboveFloor >= 0.3 &&
          aboveFloor <= 1.35 &&
          (camY === null || y < camY + 0.1)
        ) {
          nextLabel = 'table';
        }
      } else if (camY !== null) {
        const belowCam = camY - y;
        if (belowCam >= 1.15) {
          nextLabel = 'floor';
        } else if (belowCam >= 0.3 && belowCam < 1.15) {
          nextLabel = 'table';
        }
      }

      if (p.label !== nextLabel) {
        p.label = nextLabel;
        p.lastChangedTime = timestampMs;
      }
    }
  }

  private enforcePlaneCap(): void {
    const cap = this.config.maxTrackedPlanes;
    if (this.trackedPlanes.size <= cap) return;

    const ranked = Array.from(this.trackedPlanes.values()).sort((a, b) => {
      const scoreA =
        a.area *
        (1 + Math.min(a.observationCount, 10) * 0.2) *
        (a.label === 'floor' ? 2.0 : 1.0);
      const scoreB =
        b.area *
        (1 + Math.min(b.observationCount, 10) * 0.2) *
        (b.label === 'floor' ? 2.0 : 1.0);
      if (scoreB !== scoreA) return scoreB - scoreA;
      if (b.lastSeenFrame !== a.lastSeenFrame) {
        return b.lastSeenFrame - a.lastSeenFrame;
      }
      return a.createdOrder - b.createdOrder;
    });

    for (let i = cap; i < ranked.length; i++) {
      this.trackedPlanes.delete(ranked[i].id);
    }
  }

  private computeExtents2D(points: Point2D[]): [number, number] {
    let minU = Infinity,
      maxU = -Infinity,
      minV = Infinity,
      maxV = -Infinity;
    for (let i = 0; i < points.length; i++) {
      const pt = points[i];
      if (pt.u < minU) minU = pt.u;
      if (pt.u > maxU) maxU = pt.u;
      if (pt.v < minV) minV = pt.v;
      if (pt.v > maxV) maxV = pt.v;
    }
    return [maxU - minU, maxV - minV];
  }

  private toSnapshot(plane: TrackedPlaneState): TrackedPlaneSnapshot {
    const snapshot: TrackedPlaneSnapshot = {
      id: plane.id,
      type: plane.type,
      area: plane.area,
      position: [plane.position[0], plane.position[1], plane.position[2]],
      quaternion: [
        plane.quaternion[0],
        plane.quaternion[1],
        plane.quaternion[2],
        plane.quaternion[3],
      ],
      extents: [plane.extents[0], plane.extents[1]],
      polygon: plane.polygon.slice(),
      lastChangedTime: plane.lastChangedTime,
    };
    if (plane.label !== undefined) {
      snapshot.label = plane.label;
    }
    return snapshot;
  }
}
