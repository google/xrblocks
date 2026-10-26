/**
 * Synthetic MoGe outputs for the photo_depth tests: a known camera looks at
 * a known scene, and the metric points are turned into MoGe's affine form
 * (divided by the metric scale, z shifted) so solvers can be checked against
 * the ground truth.
 */
import * as THREE from 'three';

import {MOGE_SIZE} from './moge.js';

export const PLANE = MOGE_SIZE * MOGE_SIZE;

export interface Intrinsics {
  fx: number;
  fy: number;
  cx: number;
  cy: number;
}

/** Deterministic noise in [-1, 1] (tests must not flake). */
export function makeNoise(seed = 1) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return (state / 0xffffffff) * 2 - 1;
  };
}

/**
 * Renders `depthAt(px, py)` (metric planar depth, or 0 for none) through
 * camera `K` into MoGe's affine point map: metric = (affine + [0,0,shift]) ·
 * scale, OpenCV axes (x right, y down, z forward).
 */
export function makeScene({
  K,
  depthAt,
  scale = 2.5,
  shift = 0.8,
  zNoise = 0,
  valid,
}: {
  K: Intrinsics;
  depthAt: (px: number, py: number) => number;
  scale?: number;
  shift?: number;
  zNoise?: number;
  valid?: Uint8Array;
}) {
  const points = new Float32Array(PLANE * 3);
  const mask = new Float32Array(PLANE);
  const trueDepth = new Float32Array(PLANE);
  const noise = makeNoise(7);
  for (let py = 0; py < MOGE_SIZE; py++) {
    for (let px = 0; px < MOGE_SIZE; px++) {
      const i = py * MOGE_SIZE + px;
      const d = depthAt(px, py);
      if (!(d > 0)) continue;
      trueDepth[i] = d;
      const X = ((px + 0.5 - K.cx) / K.fx) * d;
      const Y = ((py + 0.5 - K.cy) / K.fy) * d;
      const Z = d * (1 + zNoise * noise());
      points[i * 3] = X / scale;
      points[i * 3 + 1] = Y / scale;
      points[i * 3 + 2] = Z / scale - shift;
      mask[i] = 1;
    }
  }
  return {
    points,
    mask,
    valid: valid ?? new Uint8Array(PLANE).fill(1),
    trueDepth,
    scale,
    shift,
  };
}

/**
 * Planar depth of a camera at `worldFromView` (three.js camera frame) seeing
 * the plane `normal · p = constant`, per model pixel; 0 where the ray misses.
 */
export function planeDepth(
  K: Intrinsics,
  worldFromView: THREE.Matrix4,
  plane: THREE.Plane
) {
  const origin = new THREE.Vector3().setFromMatrixPosition(worldFromView);
  const rotation = new THREE.Matrix3().setFromMatrix4(worldFromView);
  const direction = new THREE.Vector3();
  return (px: number, py: number) => {
    // Unit planar depth along the three.js camera ray.
    direction
      .set((px + 0.5 - K.cx) / K.fx, -(py + 0.5 - K.cy) / K.fy, -1)
      .applyMatrix3(rotation);
    const denominator = plane.normal.dot(direction);
    if (Math.abs(denominator) < 1e-9) return 0;
    const t = -(plane.normal.dot(origin) + plane.constant) / denominator;
    return t > 0 ? t : 0;
  };
}

/** A camera at `position` pitched by `pitchRad` (negative looks down). */
export function cameraPose(position: THREE.Vector3, pitchRad = 0, yawRad = 0) {
  return new THREE.Matrix4().compose(
    position,
    new THREE.Quaternion().setFromEuler(
      new THREE.Euler(pitchRad, yawRad, 0, 'YXZ')
    ),
    new THREE.Vector3(1, 1, 1)
  );
}
