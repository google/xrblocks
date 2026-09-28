/**
 * Accuracy and scale tools for a photo depth map placed in the world:
 * comparison against the headset's sensed depth (when the device has a depth
 * sensor, or the simulator's synthetic depth), and a sensor-free scale
 * correction that puts the photographed floor at y = 0.
 */
import * as THREE from 'three';

import {unprojectPixel} from './depthmap.js';

/**
 * Copies the current sensed depth frame (meters) with the matrices needed to
 * project world points into it, or `null` when no depth is available. Taken
 * at capture time so later frames cannot drift under the comparison.
 * @param depth - `xb.core.depth`.
 */
export function freezeSensedDepth(depth) {
  const raw = depth?.enabled ? depth.depthArray?.[0] : null;
  if (!raw || !depth.width || !depth.height) return null;
  if (!depth.depthViewMatrices?.[0] || !depth.depthProjectionMatrices?.[0]) {
    return null;
  }
  const toMeters = depth.rawValueToMeters || 1;
  const data = new Float32Array(raw.length);
  for (let i = 0; i < raw.length; i++) data[i] = raw[i] * toMeters;
  return {
    width: depth.width,
    height: depth.height,
    data,
    viewMatrix: depth.depthViewMatrices[0].clone(),
    projectionMatrix: depth.depthProjectionMatrices[0].clone(),
    normDepthBufferFromNormView:
      depth.normDepthBufferFromNormViewMatrices?.[0]?.clone() ??
      new THREE.Matrix4(),
  };
}

function median(sorted) {
  return sorted.length ? sorted[sorted.length >> 1] : NaN;
}

function percentile(sorted, p) {
  return sorted.length
    ? sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * p))]
    : NaN;
}

/**
 * Compares a world-placed photo depth map with a frozen sensed depth frame.
 * Each photo depth pixel is taken to world, projected into the depth camera
 * and looked up the same way `Depth.getDepth` does (nearest pixel); both
 * depths are then compared along the depth camera's axis.
 * @returns `null` when no pixel overlaps valid sensed depth, else
 *   `{n, medianAbsRel, p90AbsRel, medianAbsMeters, scaleFit,
 *   fitMedianAbsRel}`:
 *   `scaleFit` is the median sensed/photo ratio (multiply the photo depth by
 *   it to match the sensor) and `fitMedianAbsRel` the error left after that
 *   fit, i.e. the shape error of the photo depth.
 */
export function compareDepth(
  depthMap,
  worldFromView,
  sensed,
  {stride = 4} = {}
) {
  if (!sensed) return null;
  const point = new THREE.Vector3();
  const depthView = new THREE.Vector3();
  const coords = new THREE.Vector3();
  const ratios = [];
  const pairs = [];
  const {width, height, data} = depthMap;
  for (let py = 0; py < height; py += stride) {
    for (let px = 0; px < width; px += stride) {
      const depth = data[py * width + px];
      if (!(depth > 0)) continue;
      unprojectPixel(depthMap, px, py, depth, point).applyMatrix4(
        worldFromView
      );
      depthView.copy(point).applyMatrix4(sensed.viewMatrix);
      if (depthView.z >= 0) continue; // behind the depth camera
      coords.copy(depthView).applyMatrix4(sensed.projectionMatrix);
      if (Math.abs(coords.x) > 1 || Math.abs(coords.y) > 1) continue;
      // Bottom-origin view UV → top-origin → depth buffer (as Depth.getDepth).
      coords.set(0.5 * (coords.x + 1), 1 - 0.5 * (coords.y + 1), 0);
      coords.applyMatrix4(sensed.normDepthBufferFromNormView);
      const sx = Math.round(
        THREE.MathUtils.clamp(coords.x * sensed.width, 0, sensed.width - 1)
      );
      const sy = Math.round(
        THREE.MathUtils.clamp(coords.y * sensed.height, 0, sensed.height - 1)
      );
      const sensedDepth = sensed.data[sy * sensed.width + sx];
      if (!(sensedDepth > 0)) continue;
      const photoDepth = -depthView.z;
      ratios.push(sensedDepth / photoDepth);
      pairs.push(photoDepth, sensedDepth);
    }
  }
  const n = ratios.length;
  if (n === 0) return null;
  const scaleFit = median(Float64Array.from(ratios).sort());
  // Medians throughout: a few pixels that miss the surface (silhouette
  // edges, sky, sensor holes filled far away) would dominate a mean.
  const absRel = new Float64Array(n);
  const absMeters = new Float64Array(n);
  const fitAbsRel = new Float64Array(n);
  for (let k = 0; k < n; k++) {
    const photo = pairs[2 * k];
    const truth = pairs[2 * k + 1];
    absMeters[k] = Math.abs(photo - truth);
    absRel[k] = absMeters[k] / truth;
    fitAbsRel[k] = Math.abs(photo * scaleFit - truth) / truth;
  }
  absRel.sort();
  absMeters.sort();
  fitAbsRel.sort();
  return {
    n,
    medianAbsRel: median(absRel),
    p90AbsRel: percentile(absRel, 0.9),
    medianAbsMeters: median(absMeters),
    scaleFit,
    fitMedianAbsRel: median(fitAbsRel),
  };
}

/**
 * Sensor-free scale correction from the floor. Picks the photo's lowest
 * horizontal surface (normal within ~25° of vertical), and returns the factor
 * `k` that, scaling all depths about the camera, puts it at world height
 * `floorY` (0 in the `local-floor` reference space used on headsets; the
 * desktop simulator's room floor is higher). Needs the floor in the photo: a
 * desk-only photo would snap the desk to the floor, which the range check
 * below cannot always catch.
 * @param normals - MoGe's normal map (OpenCV camera axes), 448²×3.
 * @returns `{k, floorY, n}` or `null` when no floor-like surface was found.
 */
export function floorScale(
  depthMap,
  normals,
  worldFromView,
  {floorY = 0, stride = 2, minCos = 0.9, minSamples = 200} = {}
) {
  const camera = new THREE.Vector3().setFromMatrixPosition(worldFromView);
  const height = camera.y - floorY;
  if (!(height > 0.3)) return null; // camera not above a known floor
  const rotation = new THREE.Matrix3().setFromMatrix4(worldFromView);
  const normal = new THREE.Vector3();
  const point = new THREE.Vector3();
  const ys = [];
  const {data} = depthMap;
  for (let py = 0; py < depthMap.height; py += stride) {
    for (let px = 0; px < depthMap.width; px += stride) {
      const i = py * depthMap.width + px;
      const depth = data[i];
      if (!(depth > 0)) continue;
      // OpenCV (x right, y down, z forward) → three.js camera axes → world.
      normal
        .set(normals[i * 3], -normals[i * 3 + 1], -normals[i * 3 + 2])
        .applyMatrix3(rotation);
      const length = normal.length();
      if (!(length > 0) || Math.abs(normal.y) / length < minCos) continue;
      unprojectPixel(depthMap, px, py, depth, point).applyMatrix4(
        worldFromView
      );
      if (point.y < camera.y) ys.push(point.y);
    }
  }
  if (ys.length < minSamples) return null;
  const sorted = Float64Array.from(ys).sort();
  // Low percentile, not the minimum: the floor band, robust to stray points.
  const photoFloorY = sorted[Math.floor(sorted.length * 0.1)];
  const drop = camera.y - photoFloorY;
  if (!(drop > 0.2)) return null;
  const k = height / drop;
  if (!(k > 0.33 && k < 3)) return null;
  return {k, photoFloorY, n: ys.length};
}
