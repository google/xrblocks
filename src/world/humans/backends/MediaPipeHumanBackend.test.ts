import * as THREE from 'three';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import {DetectedBodyPose} from '../DetectedBodyPose';
import {processPoseLandmarkerResult} from './MediaPipeHumanBackend';

// Mock CameraUtils.transformRgbUvToWorld so the test never touches a real
// depth mesh. Returning a world position exercises the raycast path and
// returning null exercises the camera-frustum fallback.
vi.mock('../../../camera/CameraUtils', () => ({
  transformRgbUvToWorld: vi.fn(),
}));

import {transformRgbUvToWorld} from '../../../camera/CameraUtils';

function makeSnapshots() {
  const depthMeshSnapshot = new THREE.Mesh(new THREE.BufferGeometry());
  const worldFromView = new THREE.Matrix4().makeTranslation(0, 1.6, 0);
  // Identity worldFromClip keeps clip-space points where they are in world
  // space, which makes the fallback maths easy to assert on.
  const worldFromClip = new THREE.Matrix4();
  return {
    depthMeshSnapshot,
    cameraParametersSnapshot: {
      worldFromView,
      worldFromClip,
    } as never,
  };
}

type Landmark = {
  x: number;
  y: number;
  z: number;
  visibility?: number;
};

/**
 * Builds a synthetic PoseLandmarkerResult shaped like the one
 * `@mediapipe/tasks-vision` emits. The real model returns 33 body landmarks.
 */
function makeMpResult({
  landmarks,
  worldLandmarks,
}: {
  landmarks: Landmark[][];
  worldLandmarks?: Landmark[][];
}): never {
  return {
    landmarks,
    worldLandmarks: worldLandmarks ?? [],
  } as never;
}

const HIT = {worldPosition: new THREE.Vector3(1, 2, 3)};

beforeEach(() => {
  vi.mocked(transformRgbUvToWorld).mockReset();
});

describe('processPoseLandmarkerResult', () => {
  it('returns one pose per detected person', () => {
    vi.mocked(transformRgbUvToWorld).mockReturnValue(HIT as never);
    const {depthMeshSnapshot, cameraParametersSnapshot} = makeSnapshots();
    const result = makeMpResult({
      landmarks: [[{x: 0.4, y: 0.5, z: 0}], [{x: 0.6, y: 0.7, z: 0}]],
    });

    const poses = processPoseLandmarkerResult(
      result,
      depthMeshSnapshot,
      cameraParametersSnapshot
    );

    expect(poses).toHaveLength(2);
    expect(poses[0]).toBeInstanceOf(DetectedBodyPose);
  });

  it('returns nothing when no one was detected', () => {
    const {depthMeshSnapshot, cameraParametersSnapshot} = makeSnapshots();

    const poses = processPoseLandmarkerResult(
      makeMpResult({landmarks: []}),
      depthMeshSnapshot,
      cameraParametersSnapshot
    );

    expect(poses).toEqual([]);
  });

  it('uses the depth-mesh raycast hit as the world position', () => {
    vi.mocked(transformRgbUvToWorld).mockReturnValue(HIT as never);
    const {depthMeshSnapshot, cameraParametersSnapshot} = makeSnapshots();

    const [pose] = processPoseLandmarkerResult(
      makeMpResult({landmarks: [[{x: 0.5, y: 0.5, z: 0}]]}),
      depthMeshSnapshot,
      cameraParametersSnapshot
    );

    expect(pose.landmarks[0].worldPosition!.toArray()).toEqual([1, 2, 3]);
  });

  it('falls back to camera back-projection when the raycast misses', () => {
    vi.mocked(transformRgbUvToWorld).mockReturnValue(null as never);
    const {depthMeshSnapshot, cameraParametersSnapshot} = makeSnapshots();

    const [pose] = processPoseLandmarkerResult(
      makeMpResult({landmarks: [[{x: 0.5, y: 0.5, z: 0}]]}),
      depthMeshSnapshot,
      cameraParametersSnapshot
    );

    // The fallback places the joint along the view ray, 1.5 m from the
    // camera origin, which worldFromView puts at eye height.
    const cameraOrigin = new THREE.Vector3(0, 1.6, 0);
    expect(
      pose.landmarks[0].worldPosition!.distanceTo(cameraOrigin)
    ).toBeCloseTo(1.5);
  });

  it('pushes the fallback further out for larger landmark depth', () => {
    vi.mocked(transformRgbUvToWorld).mockReturnValue(null as never);
    const {depthMeshSnapshot, cameraParametersSnapshot} = makeSnapshots();

    const [pose] = processPoseLandmarkerResult(
      makeMpResult({landmarks: [[{x: 0.5, y: 0.5, z: 0.5}]]}),
      depthMeshSnapshot,
      cameraParametersSnapshot
    );

    const cameraOrigin = new THREE.Vector3(0, 1.6, 0);
    expect(
      pose.landmarks[0].worldPosition!.distanceTo(cameraOrigin)
    ).toBeCloseTo(2.0);
  });

  it('computes the bounding box from the normalized landmarks', () => {
    vi.mocked(transformRgbUvToWorld).mockReturnValue(HIT as never);
    const {depthMeshSnapshot, cameraParametersSnapshot} = makeSnapshots();

    const [pose] = processPoseLandmarkerResult(
      makeMpResult({
        landmarks: [
          [
            {x: 0.2, y: 0.3, z: 0},
            {x: 0.8, y: 0.9, z: 0},
            {x: 0.5, y: 0.4, z: 0},
          ],
        ],
      }),
      depthMeshSnapshot,
      cameraParametersSnapshot
    );

    expect(pose.detection2DBoundingBox.min.x).toBeCloseTo(0.2);
    expect(pose.detection2DBoundingBox.min.y).toBeCloseTo(0.3);
    expect(pose.detection2DBoundingBox.max.x).toBeCloseTo(0.8);
    expect(pose.detection2DBoundingBox.max.y).toBeCloseTo(0.9);
  });

  it('prefers the metric world-landmark depth when present', () => {
    vi.mocked(transformRgbUvToWorld).mockReturnValue(HIT as never);
    const {depthMeshSnapshot, cameraParametersSnapshot} = makeSnapshots();

    const [pose] = processPoseLandmarkerResult(
      makeMpResult({
        landmarks: [[{x: 0.5, y: 0.5, z: 0.1}]],
        worldLandmarks: [[{x: 0, y: 0, z: 0.87}]],
      }),
      depthMeshSnapshot,
      cameraParametersSnapshot
    );

    expect(pose.landmarks[0].z).toBeCloseTo(0.87);
  });

  it('falls back to the screen-space depth without world landmarks', () => {
    vi.mocked(transformRgbUvToWorld).mockReturnValue(HIT as never);
    const {depthMeshSnapshot, cameraParametersSnapshot} = makeSnapshots();

    const [pose] = processPoseLandmarkerResult(
      makeMpResult({landmarks: [[{x: 0.5, y: 0.5, z: 0.25}]]}),
      depthMeshSnapshot,
      cameraParametersSnapshot
    );

    expect(pose.landmarks[0].z).toBeCloseTo(0.25);
  });

  it('carries the landmark visibility through', () => {
    vi.mocked(transformRgbUvToWorld).mockReturnValue(HIT as never);
    const {depthMeshSnapshot, cameraParametersSnapshot} = makeSnapshots();

    const [pose] = processPoseLandmarkerResult(
      makeMpResult({landmarks: [[{x: 0.5, y: 0.5, z: 0, visibility: 0.42}]]}),
      depthMeshSnapshot,
      cameraParametersSnapshot
    );

    expect(pose.landmarks[0].visibility).toBeCloseTo(0.42);
  });

  it('keeps the normalized screen coordinates untouched', () => {
    vi.mocked(transformRgbUvToWorld).mockReturnValue(HIT as never);
    const {depthMeshSnapshot, cameraParametersSnapshot} = makeSnapshots();

    const [pose] = processPoseLandmarkerResult(
      makeMpResult({landmarks: [[{x: 0.33, y: 0.66, z: 0}]]}),
      depthMeshSnapshot,
      cameraParametersSnapshot
    );

    expect(pose.landmarks[0].x).toBeCloseTo(0.33);
    expect(pose.landmarks[0].y).toBeCloseTo(0.66);
  });
});
