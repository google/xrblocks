import {describe, expect, it, vi} from 'vitest';

import {DepthPlaneTracker} from './DepthPlaneTracker';
import type {
  DepthFrameInput,
  PlaneTrackingWorkerResponse,
  TrackedPlaneSnapshot,
} from './SimulatorPlaneTrackingTypes';
import {createPlaneTrackingWorkerHandler} from './SimulatorPlaneTrackingWorker';

type Vec3 = [number, number, number];
type Quat = [number, number, number, number];

interface SyntheticSurface {
  intersect(origin: Vec3, dir: Vec3): number | null;
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];
}

function normalize(v: Vec3): Vec3 {
  const len = Math.hypot(v[0], v[1], v[2]);
  return len > 1e-12 ? [v[0] / len, v[1] / len, v[2] / len] : [0, 0, -1];
}

function rotateByQuat(q: Quat, v: Vec3): Vec3 {
  const [qx, qy, qz, qw] = q;
  const ix = qw * v[0] + qy * v[2] - qz * v[1];
  const iy = qw * v[1] + qz * v[0] - qx * v[2];
  const iz = qw * v[2] + qx * v[1] - qy * v[0];
  const iw = -qx * v[0] - qy * v[1] - qz * v[2];
  return [
    ix * qw + iw * -qx + iy * -qz - iz * -qy,
    iy * qw + iw * -qy + iz * -qx - ix * -qz,
    iz * qw + iw * -qz + ix * -qy - iy * -qx,
  ];
}

/**
 * Builds a right-handed Three.js perspective projection matrix (column-major).
 */
function makePerspectiveMatrix(
  fovYDeg: number,
  aspect: number,
  near = 0.05,
  far = 50
): Float32Array {
  const f = 1 / Math.tan(((fovYDeg * Math.PI) / 180) * 0.5);
  const nf = 1 / (near - far);
  const m = new Float32Array(16);
  m[0] = f / aspect;
  m[5] = f;
  m[10] = (far + near) * nf;
  m[11] = -1;
  m[14] = 2 * far * near * nf;
  return m;
}

/**
 * Builds a right-handed camera quaternion looking from `eye` toward `target`.
 */
function lookAtQuaternion(eye: Vec3, target: Vec3, up: Vec3 = [0, 1, 0]): Quat {
  const zAxis = normalize(sub(eye, target)); // camera +Z points backward
  const xAxis = normalize(cross(up, zAxis));
  const yAxis = normalize(cross(zAxis, xAxis));

  const m00 = xAxis[0],
    m10 = xAxis[1],
    m20 = xAxis[2];
  const m01 = yAxis[0],
    m11 = yAxis[1],
    m21 = yAxis[2];
  const m02 = zAxis[0],
    m12 = zAxis[1],
    m22 = zAxis[2];

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
    const s = 2 * Math.sqrt(1 + m00 - m11 - m22);
    qw = (m21 - m12) / s;
    qx = 0.25 * s;
    qy = (m01 + m10) / s;
    qz = (m02 + m20) / s;
  } else if (m11 > m22) {
    const s = 2 * Math.sqrt(1 + m11 - m00 - m22);
    qw = (m02 - m20) / s;
    qx = (m01 + m10) / s;
    qy = 0.25 * s;
    qz = (m12 + m21) / s;
  } else {
    const s = 2 * Math.sqrt(1 + m22 - m00 - m11);
    qw = (m10 - m01) / s;
    qx = (m02 + m20) / s;
    qy = (m12 + m21) / s;
    qz = 0.25 * s;
  }
  const len = Math.hypot(qx, qy, qz, qw);
  return [qx / len, qy / len, qz / len, qw / len];
}

function makePlanarRect(
  center: Vec3,
  normal: Vec3,
  axisU: Vec3,
  halfU: number,
  halfV: number
): SyntheticSurface {
  const n = normalize(normal);
  const u = normalize(axisU);
  const v = normalize(cross(n, u));
  return {
    intersect(origin: Vec3, dir: Vec3): number | null {
      const denom = dot(dir, n);
      if (Math.abs(denom) < 1e-6) return null;
      const t = dot(sub(center, origin), n) / denom;
      if (t <= 0.05) return null;
      const hit: Vec3 = [
        origin[0] + dir[0] * t,
        origin[1] + dir[1] * t,
        origin[2] + dir[2] * t,
      ];
      const rel = sub(hit, center);
      if (Math.abs(dot(rel, u)) > halfU || Math.abs(dot(rel, v)) > halfV) {
        return null;
      }
      return t;
    },
  };
}

function makeSphere(center: Vec3, radius: number): SyntheticSurface {
  return {
    intersect(origin: Vec3, dir: Vec3): number | null {
      const oc = sub(origin, center);
      const b = dot(oc, dir);
      const c = dot(oc, oc) - radius * radius;
      const disc = b * b - c;
      if (disc < 0) return null;
      const sqrtDisc = Math.sqrt(disc);
      const t0 = -b - sqrtDisc;
      if (t0 > 0.05) return t0;
      const t1 = -b + sqrtDisc;
      return t1 > 0.05 ? t1 : null;
    },
  };
}

function makeVerticalCylinder(
  centerX: number,
  centerZ: number,
  radius: number,
  minY: number,
  maxY: number
): SyntheticSurface {
  return {
    intersect(origin: Vec3, dir: Vec3): number | null {
      const ox = origin[0] - centerX;
      const oz = origin[2] - centerZ;
      const a = dir[0] * dir[0] + dir[2] * dir[2];
      if (a < 1e-8) return null;
      const b = 2 * (ox * dir[0] + oz * dir[2]);
      const c = ox * ox + oz * oz - radius * radius;
      const disc = b * b - 4 * a * c;
      if (disc < 0) return null;
      const sqrtDisc = Math.sqrt(disc);
      for (const t of [(-b - sqrtDisc) / (2 * a), (-b + sqrtDisc) / (2 * a)]) {
        if (t <= 0.05) continue;
        const y = origin[1] + dir[1] * t;
        if (y >= minY && y <= maxY) return t;
      }
      return null;
    },
  };
}

function renderDepthFrame(params: {
  surfaces: SyntheticSurface[];
  cameraPosition: Vec3;
  cameraQuaternion: Quat;
  width?: number;
  height?: number;
  fovYDeg?: number;
  aspect?: number;
  requestId?: number;
  sceneGeneration?: number;
  timestampMs?: number;
  noiseAmplitudeMeters?: number;
}): DepthFrameInput {
  const width = params.width ?? 120;
  const height = params.height ?? 120;
  const fovYDeg = params.fovYDeg ?? 65;
  const aspect = params.aspect ?? width / height;
  const projectionMatrix = makePerspectiveMatrix(fovYDeg, aspect);
  const depthBuffer = new Float32Array(width * height);
  const p0 = projectionMatrix[0];
  const p5 = projectionMatrix[5];
  const noiseAmp = params.noiseAmplitudeMeters ?? 0;

  let seed = (params.requestId ?? 1) * 2654435761;
  const nextSignedNoise = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return (seed / 0xffffffff) * 2 - 1;
  };

  for (let py = 0; py < height; py++) {
    const ndcY = 1 - 2 * ((py + 0.5) / height);
    const rayY = ndcY / p5;
    for (let px = 0; px < width; px++) {
      const ndcX = 2 * ((px + 0.5) / width) - 1;
      const rayX = ndcX / p0;
      const viewDir = normalize([rayX, rayY, -1]);
      const worldDir = rotateByQuat(params.cameraQuaternion, viewDir);

      let nearestT = Infinity;
      for (const surface of params.surfaces) {
        const t = surface.intersect(params.cameraPosition, worldDir);
        if (t !== null && t < nearestT) {
          nearestT = t;
        }
      }

      if (Number.isFinite(nearestT)) {
        // Linear view-space depth (-z_view) matches SimulatorDepth output.
        const linearDepth = nearestT * -viewDir[2];
        const noisy =
          noiseAmp > 0
            ? linearDepth + nextSignedNoise() * noiseAmp
            : linearDepth;
        depthBuffer[py * width + px] = Math.max(0, noisy);
      }
    }
  }

  return {
    requestId: params.requestId ?? 1,
    sceneGeneration: params.sceneGeneration ?? 1,
    timestampMs: params.timestampMs ?? 100,
    width,
    height,
    depthBuffer,
    projectionMatrix,
    cameraPosition: params.cameraPosition,
    cameraQuaternion: params.cameraQuaternion,
  };
}

function planeWorldVertices(plane: TrackedPlaneSnapshot): Vec3[] {
  const verts: Vec3[] = [];
  for (let i = 0; i < plane.polygon.length; i += 2) {
    const rotated = rotateByQuat(plane.quaternion, [
      plane.polygon[i],
      0,
      plane.polygon[i + 1],
    ]);
    verts.push([
      plane.position[0] + rotated[0],
      plane.position[1] + rotated[1],
      plane.position[2] + rotated[2],
    ]);
  }
  return verts;
}

function assertValidPlaneFrame(
  plane: TrackedPlaneSnapshot,
  cameraPosition: Vec3
): Vec3 {
  const axisX = rotateByQuat(plane.quaternion, [1, 0, 0]);
  const axisY = rotateByQuat(plane.quaternion, [0, 1, 0]);
  const axisZ = rotateByQuat(plane.quaternion, [0, 0, 1]);

  expect(Math.hypot(...axisY)).toBeCloseTo(1, 4);
  expect(Math.abs(dot(axisX, axisY))).toBeLessThan(1e-4);
  expect(Math.abs(dot(axisY, axisZ))).toBeLessThan(1e-4);
  expect(dot(axisX, cross(axisY, axisZ))).toBeCloseTo(1, 4);
  expect(dot(axisY, sub(cameraPosition, plane.position))).toBeGreaterThan(0);

  expect(plane.polygon.length).toBeGreaterThanOrEqual(6);
  expect(plane.polygon.length % 2).toBe(0);
  expect(plane.area).toBeGreaterThan(0);
  expect(plane.extents[0]).toBeGreaterThan(0);
  expect(plane.extents[1]).toBeGreaterThan(0);
  return axisY;
}

describe('DepthPlaneTracker', () => {
  it('detects floor, table, wall, and ceiling with accurate poses, polygons, and labels', () => {
    const tracker = new DepthPlaneTracker();

    const floor = makePlanarRect([0, 0, -2.5], [0, 1, 0], [1, 0, 0], 4, 4);
    const table = makePlanarRect(
      [0, 0.75, -1.8],
      [0, 1, 0],
      [1, 0, 0],
      0.55,
      0.4
    );
    const backWall = makePlanarRect([0, 1.5, -3.6], [0, 0, 1], [1, 0, 0], 4, 2);
    const ceiling = makePlanarRect([0, 2.7, -2.5], [0, -1, 0], [1, 0, 0], 4, 4);

    // Frame 1: Look slightly down at table, floor, and back wall with non-square aspect.
    const camPos: Vec3 = [0, 1.65, 0.2];
    const frame1 = renderDepthFrame({
      surfaces: [floor, table, backWall, ceiling],
      cameraPosition: camPos,
      cameraQuaternion: lookAtQuaternion(camPos, [0, 0.9, -2.2]),
      width: 160,
      height: 160,
      aspect: 16 / 9,
      requestId: 1,
      timestampMs: 100,
    });

    const planes1 = tracker.processDepthFrame(frame1);
    const floorPlane = planes1.find((p) => p.label === 'floor');
    const tablePlane = planes1.find((p) => p.label === 'table');
    const wallPlane = planes1.find((p) => p.label === 'wall');

    expect(floorPlane).toBeDefined();
    expect(tablePlane).toBeDefined();
    expect(wallPlane).toBeDefined();

    // Verify floor pose and every world polygon vertex lies on y = 0.
    const floorNormal = assertValidPlaneFrame(floorPlane!, camPos);
    expect(floorPlane!.type).toBe('horizontal');
    expect(floorNormal[1]).toBeGreaterThan(0.98);
    expect(floorPlane!.position[1]).toBeCloseTo(0, 2);
    for (const v of planeWorldVertices(floorPlane!)) {
      expect(v[1]).toBeCloseTo(0, 2);
    }

    // Verify table stays separated from floor and wall across depth discontinuities.
    const tableNormal = assertValidPlaneFrame(tablePlane!, camPos);
    expect(tablePlane!.type).toBe('horizontal');
    expect(tableNormal[1]).toBeGreaterThan(0.98);
    expect(tablePlane!.position[1]).toBeCloseTo(0.75, 2);
    for (const v of planeWorldVertices(tablePlane!)) {
      expect(v[1]).toBeCloseTo(0.75, 2);
      // Must not bleed back onto the wall at z = -3.6.
      expect(v[2]).toBeGreaterThan(-2.35);
      expect(v[2]).toBeLessThan(-1.25);
    }

    // Verify wall lies on z = -3.6 with normal facing +Z.
    const wallNormal = assertValidPlaneFrame(wallPlane!, camPos);
    expect(wallPlane!.type).toBe('vertical');
    expect(wallNormal[2]).toBeGreaterThan(0.98);
    for (const v of planeWorldVertices(wallPlane!)) {
      expect(v[2]).toBeCloseTo(-3.6, 2);
    }

    // Frame 2: Tilt camera upward to discover the ceiling while retaining prior planes.
    const frame2 = renderDepthFrame({
      surfaces: [floor, table, backWall, ceiling],
      cameraPosition: camPos,
      cameraQuaternion: lookAtQuaternion(camPos, [0, 2.6, -2.2]),
      width: 160,
      height: 160,
      aspect: 16 / 9,
      requestId: 2,
      timestampMs: 250,
    });

    const planes2 = tracker.processDepthFrame(frame2);
    const ceilingPlane = planes2.find((p) => p.label === 'ceiling');
    expect(ceilingPlane).toBeDefined();
    expect(ceilingPlane!.type).toBe('horizontal');
    const ceilingNormal = assertValidPlaneFrame(ceilingPlane!, camPos);
    expect(ceilingNormal[1]).toBeLessThan(-0.98);
    expect(ceilingPlane!.position[1]).toBeCloseTo(2.7, 2);

    // Earlier floor and table remain persisted with identical IDs even when out of view.
    expect(planes2.some((p) => p.id === floorPlane!.id)).toBe(true);
    expect(planes2.some((p) => p.id === tablePlane!.id)).toBe(true);
  });

  it('rejects sloped ramps, curved cylinders/spheres, and noisy non-planar depth', () => {
    // 45-degree ramp should be rejected as neither horizontal nor vertical.
    const ramp = makePlanarRect([0, 1.0, -2.2], [0, 1, 1], [1, 0, 0], 1.5, 1.5);
    const camPos: Vec3 = [0, 1.4, 0];
    const rampTracker = new DepthPlaneTracker();
    const rampPlanes = rampTracker.processDepthFrame(
      renderDepthFrame({
        surfaces: [ramp],
        cameraPosition: camPos,
        cameraQuaternion: lookAtQuaternion(camPos, [0, 1.0, -2.2]),
      })
    );
    expect(rampPlanes).toHaveLength(0);

    // Sphere of radius 1.1m should be rejected by curvature & planarity checks.
    const sphereTracker = new DepthPlaneTracker();
    const spherePlanes = sphereTracker.processDepthFrame(
      renderDepthFrame({
        surfaces: [makeSphere([0, 1.4, -2.3], 1.1)],
        cameraPosition: camPos,
        cameraQuaternion: lookAtQuaternion(camPos, [0, 1.4, -2.3]),
      })
    );
    expect(spherePlanes).toHaveLength(0);

    // Vertical cylinder of radius 0.9m should be rejected as curved.
    const cylinderTracker = new DepthPlaneTracker();
    const cylinderPlanes = cylinderTracker.processDepthFrame(
      renderDepthFrame({
        surfaces: [makeVerticalCylinder(0, -2.4, 0.9, 0.2, 2.6)],
        cameraPosition: camPos,
        cameraQuaternion: lookAtQuaternion(camPos, [0, 1.4, -2.4]),
      })
    );
    expect(cylinderPlanes).toHaveLength(0);

    // Random noisy depth buffer should produce no planes.
    const noisyTracker = new DepthPlaneTracker();
    const noisyDepth = new Float32Array(120 * 120);
    let seed = 1337;
    for (let i = 0; i < noisyDepth.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      noisyDepth[i] = 1.5 + (seed / 0xffffffff) * 2.5;
    }
    const noisyPlanes = noisyTracker.processDepthFrame({
      requestId: 1,
      sceneGeneration: 1,
      timestampMs: 100,
      width: 120,
      height: 120,
      depthBuffer: noisyDepth,
      projectionMatrix: makePerspectiveMatrix(60, 1),
      cameraPosition: camPos,
      cameraQuaternion: [0, 0, 0, 1],
    });
    expect(noisyPlanes).toHaveLength(0);

    // Mild depth jitter (±3mm) on a flat floor should still be accepted cleanly.
    const mildNoiseTracker = new DepthPlaneTracker();
    const mildPlanes = mildNoiseTracker.processDepthFrame(
      renderDepthFrame({
        surfaces: [makePlanarRect([0, 0, -2.5], [0, 1, 0], [1, 0, 0], 3, 3)],
        cameraPosition: camPos,
        cameraQuaternion: lookAtQuaternion(camPos, [0, 0, -2.5]),
        noiseAmplitudeMeters: 0.003,
      })
    );
    expect(mildPlanes.some((p) => p.label === 'floor')).toBe(true);

    // Downward-facing underside below camera height (e.g., table underside) is not reported as a ceiling.
    const undersideTracker = new DepthPlaneTracker();
    const lowCamPos: Vec3 = [0, 0.4, 0.2];
    const tableUnderside = makePlanarRect(
      [0, 0.5, -1.6],
      [0, -1, 0],
      [1, 0, 0],
      0.8,
      0.6
    );
    const undersidePlanes = undersideTracker.processDepthFrame(
      renderDepthFrame({
        surfaces: [tableUnderside],
        cameraPosition: lowCamPos,
        cameraQuaternion: lookAtQuaternion(lowCamPos, [0, 0.5, -1.6]),
      })
    );
    expect(undersidePlanes).toHaveLength(0);
  });

  it('grows polygons incrementally with stable IDs as the camera pans and merges bridged fragments', () => {
    const tracker = new DepthPlaneTracker();
    const wideFloor = makePlanarRect([0, 0, -2.5], [0, 1, 0], [1, 0, 0], 6, 4);

    // Look at the left region of the floor.
    const camLeft: Vec3 = [-2.2, 1.6, 0.2];
    const frameLeft = renderDepthFrame({
      surfaces: [wideFloor],
      cameraPosition: camLeft,
      cameraQuaternion: lookAtQuaternion(camLeft, [-2.5, 0, -2.2]),
      fovYDeg: 45,
      requestId: 1,
      timestampMs: 100,
    });
    const afterLeft = tracker.processDepthFrame(frameLeft);
    expect(afterLeft).toHaveLength(1);
    const firstId = afterLeft[0].id;
    const initialArea = afterLeft[0].area;
    const initialChangedTime = afterLeft[0].lastChangedTime;

    // Stationary repeat frame keeps stable ID and does not churn lastChangedTime.
    const afterRepeat = tracker.processDepthFrame({
      ...frameLeft,
      requestId: 2,
      timestampMs: 200,
    });
    expect(afterRepeat).toHaveLength(1);
    expect(afterRepeat[0].id).toBe(firstId);
    expect(afterRepeat[0].lastChangedTime).toBe(initialChangedTime);

    // Jump to a disjoint right region of the floor -> creates a second floor track.
    const camRight: Vec3 = [2.2, 1.6, 0.2];
    const afterRight = tracker.processDepthFrame(
      renderDepthFrame({
        surfaces: [wideFloor],
        cameraPosition: camRight,
        cameraQuaternion: lookAtQuaternion(camRight, [2.5, 0, -2.2]),
        fovYDeg: 45,
        requestId: 3,
        timestampMs: 300,
      })
    );
    expect(afterRight).toHaveLength(2);

    // Pan across the center connecting left and right -> merges into a single larger plane
    // preserving the oldest tracked plane's ID.
    const camCenter: Vec3 = [0, 1.6, 0.5];
    const afterBridge = tracker.processDepthFrame(
      renderDepthFrame({
        surfaces: [wideFloor],
        cameraPosition: camCenter,
        cameraQuaternion: lookAtQuaternion(camCenter, [0, 0, -2.2]),
        fovYDeg: 75,
        requestId: 4,
        timestampMs: 400,
      })
    );
    expect(afterBridge).toHaveLength(1);
    expect(afterBridge[0].id).toBe(firstId);
    expect(afterBridge[0].area).toBeGreaterThan(initialArea * 2.0);
    expect(afterBridge[0].lastChangedTime).toBe(400);
  });

  it('keeps distinct coplanar tables separated when they are far apart', () => {
    const tracker = new DepthPlaneTracker();
    const leftTable = makePlanarRect(
      [-1.3, 0.75, -2.0],
      [0, 1, 0],
      [1, 0, 0],
      0.45,
      0.4
    );
    const rightTable = makePlanarRect(
      [1.3, 0.75, -2.0],
      [0, 1, 0],
      [1, 0, 0],
      0.45,
      0.4
    );
    const camPos: Vec3 = [0, 1.7, 0.3];

    const planes = tracker.processDepthFrame(
      renderDepthFrame({
        surfaces: [leftTable, rightTable],
        cameraPosition: camPos,
        cameraQuaternion: lookAtQuaternion(camPos, [0, 0.75, -2.0]),
        width: 160,
        height: 160,
        fovYDeg: 75,
        aspect: 1.5,
      })
    );

    expect(planes).toHaveLength(2);
    expect(planes.every((p) => p.label === 'table')).toBe(true);
    const xs = planes.map((p) => p.position[0]).sort((a, b) => a - b);
    expect(xs[0]).toBeCloseTo(-1.3, 1);
    expect(xs[1]).toBeCloseTo(1.3, 1);
  });

  it('enforces maxTrackedPlanes and maxPolygonVertices caps and resets cleanly on scene change', () => {
    const tracker = new DepthPlaneTracker({
      maxTrackedPlanes: 2,
      maxPolygonVertices: 6,
    });

    const floor = makePlanarRect([0, 0, -2.5], [0, 1, 0], [1, 0, 0], 4, 4);
    const tableA = makePlanarRect(
      [-1.2, 0.75, -2.0],
      [0, 1, 0],
      [1, 0, 0],
      0.45,
      0.4
    );
    const tableB = makePlanarRect(
      [1.2, 0.75, -2.0],
      [0, 1, 0],
      [1, 0, 0],
      0.45,
      0.4
    );
    const backWall = makePlanarRect([0, 1.5, -3.5], [0, 0, 1], [1, 0, 0], 4, 2);
    const camPos: Vec3 = [0, 1.7, 0.4];

    const planesGen1 = tracker.processDepthFrame(
      renderDepthFrame({
        surfaces: [floor, tableA, tableB, backWall],
        cameraPosition: camPos,
        cameraQuaternion: lookAtQuaternion(camPos, [0, 0.8, -2.4]),
        width: 160,
        height: 160,
        fovYDeg: 75,
        aspect: 1.4,
        sceneGeneration: 1,
        requestId: 1,
      })
    );

    expect(planesGen1.length).toBeLessThanOrEqual(2);
    expect(planesGen1.length).toBeGreaterThan(0);
    for (const p of planesGen1) {
      expect(p.polygon.length).toBeLessThanOrEqual(12);
    }
    const gen1Ids = new Set(planesGen1.map((p) => p.id));

    // Scene generation bump automatically clears prior tracked planes and issues fresh IDs.
    const planesGen2 = tracker.processDepthFrame(
      renderDepthFrame({
        surfaces: [floor],
        cameraPosition: camPos,
        cameraQuaternion: lookAtQuaternion(camPos, [0, 0, -2.4]),
        sceneGeneration: 2,
        requestId: 2,
      })
    );
    expect(planesGen2).toHaveLength(1);
    expect(gen1Ids.has(planesGen2[0].id)).toBe(false);

    // Explicit reset clears everything immediately.
    tracker.reset(3);
    expect(tracker.getTrackedPlanes()).toEqual([]);
  });

  it('detects arbitrarily oriented vertical walls accurately and persists planes when looking away', () => {
    const tracker = new DepthPlaneTracker();
    const diagNormal = normalize([1, 0, 1]);
    const diagAxisU = normalize([-1, 0, 1]);
    const diagWall = makePlanarRect(
      [-1.5, 1.5, -1.5],
      diagNormal,
      diagAxisU,
      1.8,
      1.2
    );
    const camPos: Vec3 = [0.5, 1.5, 0.5];

    const planes1 = tracker.processDepthFrame(
      renderDepthFrame({
        surfaces: [diagWall],
        cameraPosition: camPos,
        cameraQuaternion: lookAtQuaternion(camPos, [-1.5, 1.5, -1.5]),
        requestId: 1,
        timestampMs: 100,
      })
    );
    expect(planes1).toHaveLength(1);
    const wall = planes1[0];
    expect(wall.type).toBe('vertical');
    expect(wall.label).toBe('wall');
    const wallNormal = assertValidPlaneFrame(wall, camPos);
    expect(dot(wallNormal, diagNormal)).toBeGreaterThan(0.99);
    for (const v of planeWorldVertices(wall)) {
      const planeResidual = Math.abs(
        dot(sub(v, [-1.5, 1.5, -1.5]), diagNormal)
      );
      expect(planeResidual).toBeLessThan(0.03);
    }

    // Looking away into empty space keeps previously tracked planes intact.
    const planes2 = tracker.processDepthFrame(
      renderDepthFrame({
        surfaces: [diagWall],
        cameraPosition: camPos,
        cameraQuaternion: lookAtQuaternion(camPos, [3.0, 1.5, 3.0]),
        requestId: 2,
        timestampMs: 250,
      })
    );
    expect(planes2).toHaveLength(1);
    expect(planes2[0].id).toBe(wall.id);
    expect(planes2[0].lastChangedTime).toBe(100);
  });
});

describe('createPlaneTrackingWorkerHandler', () => {
  it('handles configure, processDepth, reset, dispose, and invalid input errors', () => {
    const posted: PlaneTrackingWorkerResponse[] = [];
    const close = vi.fn();
    const handler = createPlaneTrackingWorkerHandler({
      postMessage: (msg) => posted.push(msg),
      close,
    });

    handler({
      type: 'configure',
      config: {maxTrackedPlanes: 10, maxPolygonVertices: 12},
    });
    expect(posted).toHaveLength(0);

    const floor = makePlanarRect([0, 0, -2.5], [0, 1, 0], [1, 0, 0], 3, 3);
    const camPos: Vec3 = [0, 1.6, 0];
    const frame = renderDepthFrame({
      surfaces: [floor],
      cameraPosition: camPos,
      cameraQuaternion: lookAtQuaternion(camPos, [0, 0, -2.5]),
      requestId: 7,
      sceneGeneration: 4,
      timestampMs: 500,
    });

    handler({type: 'processDepth', ...frame});
    expect(posted).toHaveLength(1);
    const firstReply = posted[0];
    expect(firstReply.type).toBe('planes');
    if (firstReply.type === 'planes') {
      expect(firstReply.requestId).toBe(7);
      expect(firstReply.sceneGeneration).toBe(4);
      expect(firstReply.planes.length).toBeGreaterThan(0);
      expect(firstReply.planes[0].label).toBe('floor');
    }

    // Reset clears tracked state so an empty depth buffer reports zero planes.
    handler({type: 'reset', sceneGeneration: 5});
    handler({
      type: 'processDepth',
      requestId: 8,
      sceneGeneration: 5,
      timestampMs: 600,
      width: 32,
      height: 32,
      depthBuffer: new Float32Array(32 * 32),
      projectionMatrix: makePerspectiveMatrix(60, 1),
      cameraPosition: camPos,
      cameraQuaternion: [0, 0, 0, 1],
    });
    expect(posted).toHaveLength(2);
    expect(posted[1]).toEqual({
      type: 'planes',
      requestId: 8,
      sceneGeneration: 5,
      planes: [],
    });

    // Invalid buffer dimensions emit a structured error reply instead of throwing.
    handler({
      type: 'processDepth',
      requestId: 9,
      sceneGeneration: 5,
      timestampMs: 700,
      width: 10,
      height: 10,
      depthBuffer: new Float32Array(4),
      projectionMatrix: makePerspectiveMatrix(60, 1),
      cameraPosition: camPos,
      cameraQuaternion: [0, 0, 0, 1],
    });
    expect(posted).toHaveLength(3);
    expect(posted[2]).toMatchObject({
      type: 'error',
      requestId: 9,
      sceneGeneration: 5,
    });

    handler({type: 'dispose'});
    expect(close).toHaveBeenCalledOnce();
  });
});
