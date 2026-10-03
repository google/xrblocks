/**
 * MoGe point map → metric depth map in the capturing camera's frame.
 *
 * MoGe predicts an *affine* point map: correct up to a global scale and a
 * shift along the optical axis. Given the camera focal length, the shift is
 * the one that makes the points project back onto their own pixels
 * (MoGe's `solve_optimal_shift`); MoGe's scale output then turns the shifted
 * map into meters. The result is a planar-z depth map on the 448² model grid
 * together with the pinhole intrinsics of that grid, so every depth pixel
 * unprojects along the real camera ray and lines up with the photo.
 *
 * All pixel coordinates here are continuous with pixel centers at `i + 0.5`.
 */
import * as THREE from 'three';

import {MOGE_MASK_THRESHOLD, MOGE_SIZE} from './moge.js';

/**
 * Pinhole intrinsics (pixels) of a `width`×`height` image from an OpenGL
 * projection matrix, the inverse of `xb.intrinsicsToProjectionMatrix`.
 */
export function intrinsicsFromProjection(projection, width, height) {
  const e = projection.elements;
  return {
    fx: (e[0] * width) / 2,
    fy: (e[5] * height) / 2,
    cx: ((1 - e[8]) * width) / 2,
    cy: ((1 + e[9]) * height) / 2,
  };
}

/** Centered pinhole intrinsics with the given horizontal field of view. */
export function intrinsicsFromFov(hfovDeg, width, height) {
  const f = width / 2 / Math.tan(THREE.MathUtils.degToRad(hfovDeg) / 2);
  return {fx: f, fy: f, cx: width / 2, cy: height / 2};
}

/** Horizontal field of view (degrees) of focal `fx` over `width` pixels. */
export function horizontalFov(fx, width) {
  return THREE.MathUtils.radToDeg(2 * Math.atan(width / 2 / fx));
}

/** Maps photo intrinsics onto the letterboxed model grid. */
export function intrinsicsToLetterbox(K, letterbox) {
  return {
    fx: K.fx * letterbox.scaleX,
    fy: K.fy * letterbox.scaleY,
    cx: letterbox.offX + K.cx * letterbox.scaleX,
    cy: letterbox.offY + K.cy * letterbox.scaleY,
  };
}

/**
 * Whether model pixel `i` belongs to the photo, away from the letterbox
 * padding and the outer rim (MoGe's depth smears at both).
 */
function isInterior(valid, i, border) {
  const SIZE = MOGE_SIZE;
  const px = i % SIZE;
  const py = (i / SIZE) | 0;
  return (
    valid[i] &&
    px >= border &&
    px < SIZE - border &&
    py >= border &&
    py < SIZE - border &&
    valid[i - 1] &&
    valid[i + 1] &&
    valid[i - SIZE] &&
    valid[i + SIZE]
  );
}

/**
 * Samples the confident interior of the point map on a regular grid (MoGe
 * fits the shift on a 64² grid too): pixel centers and affine points.
 */
export function samplePointMap(
  points,
  mask,
  valid,
  {grid = 64, border = 2} = {}
) {
  const SIZE = MOGE_SIZE;
  const step = Math.max(1, Math.floor(SIZE / grid));
  const u = [];
  const v = [];
  const x = [];
  const y = [];
  const z = [];
  for (let py = step >> 1; py < SIZE; py += step) {
    for (let px = step >> 1; px < SIZE; px += step) {
      const i = py * SIZE + px;
      if (!isInterior(valid, i, border) || !(mask[i] > MOGE_MASK_THRESHOLD)) {
        continue;
      }
      const X = points[i * 3];
      const Y = points[i * 3 + 1];
      const Z = points[i * 3 + 2];
      if (!Number.isFinite(X) || !Number.isFinite(Y) || !(Z > 0)) continue;
      u.push(px + 0.5);
      v.push(py + 0.5);
      x.push(X);
      y.push(Y);
      z.push(Z);
    }
  }
  return {n: z.length, u, v, x, y, z};
}

function sortedCopy(values) {
  return Float64Array.from(values).sort();
}

/**
 * Reprojection cost of shift `s`: the squared pixel error of the shifted
 * points against their own pixels, with the focal either given or (when
 * `focal` is null) solved in closed form (fx = fy, least squares).
 * @returns {{cost: number, focal: number}}
 */
function shiftCost(sample, s, K, focal) {
  const {n, u, v, x, y, z} = sample;
  let aa = 0;
  let ad = 0;
  let dd = 0;
  let cost = 0;
  for (let i = 0; i < n; i++) {
    const depth = z[i] + s;
    const ax = x[i] / depth;
    const ay = y[i] / depth;
    const du = u[i] - K.cx;
    const dv = v[i] - K.cy;
    if (focal === null) {
      aa += ax * ax + ay * ay;
      ad += ax * du + ay * dv;
      dd += du * du + dv * dv;
    } else {
      const rx = K.fx * ax - du;
      const ry = K.fy * ay - dv;
      cost += rx * rx + ry * ry;
    }
  }
  if (focal === null) {
    const f = aa > 0 ? ad / aa : NaN;
    return {cost: dd - f * ad, focal: f};
  }
  return {cost, focal: K.fx};
}

/**
 * Minimizes the reprojection cost over the shift. The shift is searched as
 * `q = zMin + s` (the nearest point's shifted depth, which must stay
 * positive) on a log grid spanning 1e-3…50 × the median depth, then refined
 * by golden-section search around the best grid cell. Robust to the cost's
 * pole at q → 0 and needs no starting guess.
 */
function minimizeShift(sample, K, focal) {
  if (sample.n < 16) throw new Error('too few confident pixels to align');
  const sortedZ = sortedCopy(sample.z);
  const zMin = sortedZ[0];
  const zMedian = sortedZ[sortedZ.length >> 1];
  const logLo = Math.log(1e-3 * zMedian);
  const logHi = Math.log(50 * zMedian);
  const evaluate = (t) => shiftCost(sample, Math.exp(t) - zMin, K, focal).cost;

  const STEPS = 96;
  let bestIndex = 0;
  let bestCost = Infinity;
  for (let k = 0; k <= STEPS; k++) {
    const cost = evaluate(logLo + ((logHi - logLo) * k) / STEPS);
    if (cost < bestCost) {
      bestCost = cost;
      bestIndex = k;
    }
  }
  const cell = (logHi - logLo) / STEPS;
  let a = logLo + cell * Math.max(0, bestIndex - 1);
  let b = logLo + cell * Math.min(STEPS, bestIndex + 1);
  const GOLD = (Math.sqrt(5) - 1) / 2;
  let c = b - GOLD * (b - a);
  let d = a + GOLD * (b - a);
  let fc = evaluate(c);
  let fd = evaluate(d);
  for (let k = 0; k < 60 && b - a > 1e-9; k++) {
    if (fc < fd) {
      b = d;
      d = c;
      fd = fc;
      c = b - GOLD * (b - a);
      fc = evaluate(c);
    } else {
      a = c;
      c = d;
      fc = fd;
      d = a + GOLD * (b - a);
      fd = evaluate(d);
    }
  }
  const shift = Math.exp((a + b) / 2) - zMin;
  const {cost, focal: fitFocal} = shiftCost(sample, shift, K, focal);
  return {
    shift,
    focal: fitFocal,
    rmsPx: Math.sqrt(Math.max(0, cost) / (2 * sample.n)),
  };
}

/**
 * Recovers MoGe's z-shift for a known camera (MoGe `solve_optimal_shift`).
 * @param sample - From {@link samplePointMap}.
 * @param K - Intrinsics on the model grid ({@link intrinsicsToLetterbox}).
 * @returns {{shift: number, rmsPx: number}}
 */
export function solveShift(sample, K) {
  const {shift, rmsPx} = minimizeShift(sample, K, K.fx);
  return {shift, rmsPx};
}

/**
 * Recovers MoGe's z-shift together with its own focal estimate (square
 * pixels, principal point `cx, cy`), as MoGe does when no camera is known.
 * @returns {{shift: number, focal: number, rmsPx: number}}
 */
export function solveFocalShift(sample, {cx, cy}) {
  return minimizeShift(sample, {fx: NaN, fy: NaN, cx, cy}, null);
}

/**
 * Metric planar depth (meters along the optical axis) on the 448² model
 * grid; 0 marks no depth (padding, rim, low confidence).
 * @param metricScale - MoGe's scale output times any user correction.
 */
export function buildDepthMap(
  {points, mask, valid},
  K,
  shift,
  metricScale,
  {border = 2} = {}
) {
  const SIZE = MOGE_SIZE;
  const plane = SIZE * SIZE;
  const data = new Float32Array(plane);
  let count = 0;
  for (let i = 0; i < plane; i++) {
    if (!isInterior(valid, i, border) || !(mask[i] > MOGE_MASK_THRESHOLD)) {
      continue;
    }
    const depth = (points[i * 3 + 2] + shift) * metricScale;
    if (depth > 0 && Number.isFinite(depth)) {
      data[i] = depth;
      count++;
    }
  }
  return {width: SIZE, height: SIZE, data, count, ...K};
}

/**
 * The point seen at model pixel (`px`, `py`) at planar depth `depth`, in the
 * three.js camera frame (x right, y up, looking down −z).
 */
export function unprojectPixel(depthMap, px, py, depth, target) {
  return target.set(
    ((px + 0.5 - depthMap.cx) / depthMap.fx) * depth,
    (-(py + 0.5 - depthMap.cy) / depthMap.fy) * depth,
    -depth
  );
}

/** Robust depth range of a depth map (percentiles of the non-zero pixels). */
export function depthRange(depthMap, low = 0.02, high = 0.98) {
  const {data} = depthMap;
  const step = Math.max(1, Math.floor(data.length / 20000));
  const values = [];
  for (let i = 0; i < data.length; i += step) {
    if (data[i] > 0) values.push(data[i]);
  }
  if (values.length === 0) return {near: 0, median: 0, far: 0};
  const sorted = sortedCopy(values);
  const at = (p) =>
    sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))];
  return {near: at(low), median: at(0.5), far: at(high)};
}

// sRGB byte → linear float, so photo colors survive three.js color management.
export const SRGB_TO_LINEAR = new Float32Array(256);
for (let i = 0; i < 256; i++) {
  const c = i / 255;
  SRGB_TO_LINEAR[i] =
    c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

/**
 * Colored point cloud of a depth map in the capturing camera's three.js
 * frame; place it in the world by setting its matrix to `worldFromView`.
 * `raycast` is disabled so loose points never steal pointer rays.
 */
export function depthMapToCloud(
  depthMap,
  rgba,
  {stride = 1, sizeScale = 1.5} = {}
) {
  const {width, height, data} = depthMap;
  const positions = [];
  const colors = [];
  const p = new THREE.Vector3();
  for (let py = 0; py < height; py += stride) {
    for (let px = 0; px < width; px += stride) {
      const i = py * width + px;
      const depth = data[i];
      if (!(depth > 0)) continue;
      unprojectPixel(depthMap, px, py, depth, p);
      positions.push(p.x, p.y, p.z);
      colors.push(
        SRGB_TO_LINEAR[rgba[i * 4]],
        SRGB_TO_LINEAR[rgba[i * 4 + 1]],
        SRGB_TO_LINEAR[rgba[i * 4 + 2]]
      );
    }
  }
  if (positions.length === 0) throw new Error('the depth map is empty');
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute(
    'position',
    new THREE.Float32BufferAttribute(positions, 3)
  );
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeBoundingSphere();
  // A little over the sample spacing at the median depth reads as a surface.
  const {median} = depthRange(depthMap);
  const material = new THREE.PointsMaterial({
    size: (sizeScale * stride * median) / depthMap.fx,
    vertexColors: true,
    sizeAttenuation: true,
  });
  const cloud = new THREE.Points(geometry, material);
  cloud.name = 'PhotoDepthCloud';
  cloud.raycast = () => {};
  cloud.userData.count = positions.length / 3;
  return cloud;
}

/** Releases the GPU resources of an object made by this module. */
export function disposeObject(object) {
  object?.geometry?.dispose();
  object?.material?.dispose();
}
