import * as THREE from 'three';
import {describe, expect, it} from 'vitest';

import {
  compareDepth,
  floorScale,
  freezeSensedDepth,
  photoFloorHeight,
} from './depthcompare.js';
import {MOGE_SIZE} from './moge.js';
import {PLANE, cameraPose, planeDepth} from './testScenes';

const K = {fx: 280, fy: 280, cx: 224, cy: 224};

function depthMapFrom(depthAt: (px: number, py: number) => number, gain = 1) {
  const data = new Float32Array(PLANE);
  for (let py = 0; py < MOGE_SIZE; py++) {
    for (let px = 0; px < MOGE_SIZE; px++) {
      data[py * MOGE_SIZE + px] = depthAt(px, py) * gain;
    }
  }
  return {width: MOGE_SIZE, height: MOGE_SIZE, data, ...K};
}

/** A sensed frame from a depth camera at `worldFromDepth` seeing `plane`. */
function sensedFrame(worldFromDepth: THREE.Matrix4, plane: THREE.Plane) {
  const size = 64;
  const projection = new THREE.PerspectiveCamera(90, 1, 0.1, 100)
    .projectionMatrix;
  const f = size / 2; // 90° FOV
  const depthAt = planeDepth(
    {fx: f, fy: f, cx: size / 2, cy: size / 2},
    worldFromDepth,
    plane
  );
  // planeDepth indexes 448² pixels; sample it on this 64² grid.
  const data = new Float32Array(size * size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) data[y * size + x] = depthAt(x, y);
  }
  return {
    width: size,
    height: size,
    data,
    viewMatrix: worldFromDepth.clone().invert(),
    projectionMatrix: projection.clone(),
    normDepthBufferFromNormView: new THREE.Matrix4(),
  };
}

describe('freezeSensedDepth', () => {
  it('is null without depth', () => {
    expect(freezeSensedDepth(undefined)).toBeNull();
    expect(freezeSensedDepth({enabled: false})).toBeNull();
    expect(freezeSensedDepth({enabled: true, depthArray: []})).toBeNull();
  });

  it('copies the frame in meters with its matrices', () => {
    const raw = new Uint16Array([1000, 2000, 0, 500]);
    const view = new THREE.Matrix4().makeTranslation(1, 2, 3);
    const depth = {
      enabled: true,
      depthArray: [raw],
      width: 2,
      height: 2,
      rawValueToMeters: 0.001,
      depthViewMatrices: [view],
      depthProjectionMatrices: [new THREE.Matrix4()],
      normDepthBufferFromNormViewMatrices: [],
    };
    const frozen = freezeSensedDepth(depth)!;
    expect(Array.from(frozen.data)).toEqual([1, 2, 0, 0.5]);
    raw[0] = 9999;
    view.identity();
    expect(frozen.data[0]).toBe(1);
    expect(frozen.viewMatrix.elements[12]).toBe(1);
  });
});

describe('compareDepth', () => {
  const wall = new THREE.Plane(new THREE.Vector3(0, 0, 1), 2); // z = -2
  const pose = cameraPose(new THREE.Vector3(0, 1.5, 0));

  it('reports no error for matching depth, even from another viewpoint', () => {
    const map = depthMapFrom(planeDepth(K, pose, wall));
    // A depth camera 5 cm to the side and 50 cm forward: planar depths differ
    // from the photo's, so this checks the whole transform chain.
    const sensed = sensedFrame(
      cameraPose(new THREE.Vector3(0.05, 1.5, -0.5)),
      wall
    );
    const result = compareDepth(map, pose, sensed)!;
    expect(result.n).toBeGreaterThan(1000);
    expect(result.medianAbsRel).toBeLessThan(1e-3);
    expect(result.scaleFit).toBeCloseTo(1, 3);
    expect(result.medianAbsMeters).toBeLessThan(0.01);
  });

  it('measures a scale error and the fit that removes it', () => {
    const map = depthMapFrom(planeDepth(K, pose, wall), 0.5);
    const sensed = sensedFrame(pose, wall);
    const result = compareDepth(map, pose, sensed)!;
    expect(result.medianAbsRel).toBeCloseTo(0.5, 2);
    expect(result.scaleFit).toBeCloseTo(2, 2);
    expect(result.fitMedianAbsRel).toBeLessThan(0.01);
  });

  it('is null without overlap or without a frame', () => {
    const map = depthMapFrom(planeDepth(K, pose, wall));
    const lookingAway = sensedFrame(
      cameraPose(new THREE.Vector3(0, 1.5, 0), 0, Math.PI),
      new THREE.Plane(new THREE.Vector3(0, 0, -1), 2)
    );
    expect(compareDepth(map, pose, lookingAway)).toBeNull();
    expect(compareDepth(map, pose, null)).toBeNull();
  });
});

describe('floorScale', () => {
  const pose = cameraPose(new THREE.Vector3(0, 1.6, 0), -0.7);
  const floor = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  // The floor's normal (world +y) in MoGe's OpenCV camera axes.
  const normals = new Float32Array(PLANE * 3);
  const up = new THREE.Vector3(0, 1, 0).applyMatrix3(
    new THREE.Matrix3().setFromMatrix4(pose).transpose()
  );
  for (let i = 0; i < PLANE; i++) {
    normals[i * 3] = up.x;
    normals[i * 3 + 1] = -up.y;
    normals[i * 3 + 2] = -up.z;
  }

  it('finds the factor that puts the photographed floor at y = 0', () => {
    const map = depthMapFrom(planeDepth(K, pose, floor), 0.8);
    const result = floorScale(map, normals, pose)!;
    expect(result.k).toBeCloseTo(1.25, 2);
    expect(result.photoFloorY).toBeCloseTo(1.6 - 0.8 * 1.6, 2);
  });

  it('snaps to a floor at a given height', () => {
    // True floor at y = 0.3 (like the desktop simulator's room), photographed
    // 20% too close.
    const raised = new THREE.Plane(new THREE.Vector3(0, 1, 0), -0.3);
    const map = depthMapFrom(planeDepth(K, pose, raised), 0.8);
    expect(floorScale(map, normals, pose, {floorY: 0.3})!.k).toBeCloseTo(
      1.25,
      2
    );
  });

  it('reports the photo floor height without a known floor', () => {
    const map = depthMapFrom(planeDepth(K, pose, floor), 0.8);
    const result = photoFloorHeight(map, normals, pose)!;
    expect(result.y).toBeCloseTo(1.6 - 0.8 * 1.6, 2);
    expect(result.n).toBeGreaterThan(200);
  });

  it('gives up without a horizontal surface below the camera', () => {
    const map = depthMapFrom(planeDepth(K, pose, floor));
    const sideways = new Float32Array(PLANE * 3);
    for (let i = 0; i < PLANE; i++) sideways[i * 3] = 1;
    expect(floorScale(map, sideways, pose)).toBeNull();
    const onTheFloor = cameraPose(new THREE.Vector3(0, 0.1, 0), -0.7);
    expect(floorScale(map, normals, onTheFloor)).toBeNull();
  });
});
