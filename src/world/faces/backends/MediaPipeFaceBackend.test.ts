import * as THREE from 'three';
import {describe, it, expect, vi, beforeEach} from 'vitest';

import {DetectedFace} from '../DetectedFace';
import {processFaceLandmarkerResult} from './MediaPipeFaceBackend';

// Mock CameraUtils.transformRgbUvToWorld so the test never touches a real
// depth mesh. We control whether the raycast "hits" by returning either a
// world position object or null, which exercises both the depth-mesh path
// and the camera-frustum fallback path inside processFaceLandmarkerResult.
vi.mock('../../../camera/CameraUtils', () => ({
  transformRgbUvToWorld: vi.fn(),
}));

import {transformRgbUvToWorld} from '../../../camera/CameraUtils';

// Minimal snapshot inputs. The function only touches
// cameraParametersSnapshot when the raycast misses; the depth mesh is
// passed through to transformRgbUvToWorld (which we've mocked) so it
// can be any THREE.Mesh.
function makeSnapshots() {
  const depthMeshSnapshot = new THREE.Mesh(new THREE.BufferGeometry());
  const worldFromView = new THREE.Matrix4().makeTranslation(0, 1.6, 0);
  // Identity worldFromClip means clip-space points stay where they are
  // in world space, which makes the fallback math easy to assert.
  const worldFromClip = new THREE.Matrix4();
  return {
    depthMeshSnapshot,
    cameraParametersSnapshot: {
      worldFromView,
      worldFromClip,
      // The fallback only reads worldFromView and worldFromClip; the
      // other fields can be omitted for these tests.
    } as never,
  };
}

// Build a synthetic MediaPipe FaceLandmarkerResult shaped exactly like
// the @mediapipe/tasks-vision package emits. The mesh always carries 478
// landmarks but for tests we only need a handful populated.
function makeMpResult({
  numFaces = 1,
  withBlendshapes = false,
  withMatrix = false,
}: {
  numFaces?: number;
  withBlendshapes?: boolean;
  withMatrix?: boolean;
} = {}): never {
  const faceLandmarks: Array<Array<{x: number; y: number; z: number}>> = [];
  for (let f = 0; f < numFaces; f++) {
    const pts = [];
    for (let i = 0; i < 478; i++) {
      // Spread the synthetic landmarks across the bounding region so the
      // backend's bbox computation has something non-degenerate to chew on.
      pts.push({
        x: 0.3 + ((i + f * 50) % 100) / 250,
        y: 0.2 + ((i * 3 + f * 30) % 100) / 200,
        z: i * 0.0001,
      });
    }
    faceLandmarks.push(pts);
  }
  const result: Record<string, unknown> = {faceLandmarks};
  if (withBlendshapes) {
    result.faceBlendshapes = faceLandmarks.map((_, i) => ({
      categories: [
        {categoryName: 'jawOpen', score: 0.4 + i * 0.1},
        {categoryName: 'mouthSmileLeft', score: 0.2},
      ],
    }));
  }
  if (withMatrix) {
    result.facialTransformationMatrixes = faceLandmarks.map((_, i) => ({
      // Column-major translation matrix moving the face to (0, 1+i, -0.5).
      // Identity rotation/scale so decompose is round-trippable.
      data: new Float32Array([
        1,
        0,
        0,
        0,
        0,
        1,
        0,
        0,
        0,
        0,
        1,
        0,
        0,
        1 + i,
        -0.5,
        1,
      ]),
    }));
  }
  return result as never;
}

describe('processFaceLandmarkerResult', () => {
  beforeEach(() => {
    vi.mocked(transformRgbUvToWorld).mockReset();
  });

  it('returns an empty array when the MediaPipe result has no faces', () => {
    const {depthMeshSnapshot, cameraParametersSnapshot} = makeSnapshots();
    const result = makeMpResult({numFaces: 0});
    const out = processFaceLandmarkerResult(
      result,
      depthMeshSnapshot,
      cameraParametersSnapshot
    );
    expect(out).toEqual([]);
    expect(transformRgbUvToWorld).not.toHaveBeenCalled();
  });

  it('produces one DetectedFace per landmark cluster with a faceId equal to its index', () => {
    const {depthMeshSnapshot, cameraParametersSnapshot} = makeSnapshots();
    vi.mocked(transformRgbUvToWorld).mockReturnValue({
      worldPosition: new THREE.Vector3(0, 1.6, -0.5),
    } as never);
    const result = makeMpResult({numFaces: 3});
    const out = processFaceLandmarkerResult(
      result,
      depthMeshSnapshot,
      cameraParametersSnapshot
    );
    expect(out).toHaveLength(3);
    expect(out[0]).toBeInstanceOf(DetectedFace);
    expect(out.map((f) => f.faceId)).toEqual([0, 1, 2]);
    // Each face should carry all 478 landmarks.
    for (const face of out) {
      expect(face.landmarks).toHaveLength(478);
    }
  });

  it('uses the depth-mesh raycast result when transformRgbUvToWorld returns a hit', () => {
    const {depthMeshSnapshot, cameraParametersSnapshot} = makeSnapshots();
    const expectedHit = new THREE.Vector3(0.42, 1.65, -0.55);
    vi.mocked(transformRgbUvToWorld).mockReturnValue({
      worldPosition: expectedHit,
    } as never);
    const result = makeMpResult();
    const out = processFaceLandmarkerResult(
      result,
      depthMeshSnapshot,
      cameraParametersSnapshot
    );
    expect(out[0].landmarks[0].worldPosition).toBe(expectedHit);
  });

  it('falls back to camera-frustum back-projection when the depth raycast misses', () => {
    const {depthMeshSnapshot, cameraParametersSnapshot} = makeSnapshots();
    vi.mocked(transformRgbUvToWorld).mockReturnValue(null as never);
    const result = makeMpResult();
    const out = processFaceLandmarkerResult(
      result,
      depthMeshSnapshot,
      cameraParametersSnapshot
    );
    // Every landmark should still have a worldPosition (the fallback
    // always produces one), so the SDK never returns half-populated
    // faces to the caller.
    for (const lm of out[0].landmarks) {
      expect(lm.worldPosition).toBeDefined();
      expect(Number.isFinite(lm.worldPosition!.x)).toBe(true);
      expect(Number.isFinite(lm.worldPosition!.y)).toBe(true);
      expect(Number.isFinite(lm.worldPosition!.z)).toBe(true);
    }
  });

  it('emits an empty blendshapes array when MediaPipe did not return any', () => {
    const {depthMeshSnapshot, cameraParametersSnapshot} = makeSnapshots();
    vi.mocked(transformRgbUvToWorld).mockReturnValue({
      worldPosition: new THREE.Vector3(0, 1.6, -0.5),
    } as never);
    const result = makeMpResult({withBlendshapes: false});
    const out = processFaceLandmarkerResult(
      result,
      depthMeshSnapshot,
      cameraParametersSnapshot
    );
    expect(out[0].blendshapes).toEqual([]);
  });

  it('passes blendshape categories through verbatim (name + score)', () => {
    const {depthMeshSnapshot, cameraParametersSnapshot} = makeSnapshots();
    vi.mocked(transformRgbUvToWorld).mockReturnValue({
      worldPosition: new THREE.Vector3(0, 1.6, -0.5),
    } as never);
    const result = makeMpResult({withBlendshapes: true});
    const out = processFaceLandmarkerResult(
      result,
      depthMeshSnapshot,
      cameraParametersSnapshot
    );
    expect(out[0].blendshapes).toEqual([
      {categoryName: 'jawOpen', score: 0.4},
      {categoryName: 'mouthSmileLeft', score: 0.2},
    ]);
    // The lookup helper should match the verbatim category names.
    expect(out[0].getBlendshape('jawOpen')).toBeCloseTo(0.4);
  });

  it('leaves facialTransformationMatrix null when MediaPipe did not return one', () => {
    const {depthMeshSnapshot, cameraParametersSnapshot} = makeSnapshots();
    vi.mocked(transformRgbUvToWorld).mockReturnValue({
      worldPosition: new THREE.Vector3(0, 1.6, -0.5),
    } as never);
    const result = makeMpResult({withMatrix: false});
    const out = processFaceLandmarkerResult(
      result,
      depthMeshSnapshot,
      cameraParametersSnapshot
    );
    expect(out[0].facialTransformationMatrix).toBeNull();
  });

  it('builds the facial transformation matrix from the column-major MediaPipe data and decomposes onto the Object3D', () => {
    const {depthMeshSnapshot, cameraParametersSnapshot} = makeSnapshots();
    vi.mocked(transformRgbUvToWorld).mockReturnValue({
      worldPosition: new THREE.Vector3(0, 1.6, -0.5),
    } as never);
    const result = makeMpResult({withMatrix: true});
    const out = processFaceLandmarkerResult(
      result,
      depthMeshSnapshot,
      cameraParametersSnapshot
    );
    // The mock matrix translates to (0, 1, -0.5) for face 0. The
    // decomposed transform should override the depth-projected nose
    // tip so callers can parent objects directly to face.position.
    expect(out[0].facialTransformationMatrix).not.toBeNull();
    expect(out[0].position.x).toBeCloseTo(0);
    expect(out[0].position.y).toBeCloseTo(1);
    expect(out[0].position.z).toBeCloseTo(-0.5);
  });

  it('computes a tight normalized 2D bounding box from the landmark spread', () => {
    const {depthMeshSnapshot, cameraParametersSnapshot} = makeSnapshots();
    vi.mocked(transformRgbUvToWorld).mockReturnValue({
      worldPosition: new THREE.Vector3(0, 1.6, -0.5),
    } as never);
    const result = makeMpResult();
    const out = processFaceLandmarkerResult(
      result,
      depthMeshSnapshot,
      cameraParametersSnapshot
    );
    const bb = out[0].detection2DBoundingBox;
    // makeMpResult spreads landmarks roughly between (0.3, 0.2) and
    // (0.7, 0.7) in normalized image space, so the bbox should land
    // somewhere inside that range and never overflow [0, 1].
    expect(bb.min.x).toBeGreaterThanOrEqual(0);
    expect(bb.min.y).toBeGreaterThanOrEqual(0);
    expect(bb.max.x).toBeLessThanOrEqual(1);
    expect(bb.max.y).toBeLessThanOrEqual(1);
    expect(bb.max.x).toBeGreaterThan(bb.min.x);
    expect(bb.max.y).toBeGreaterThan(bb.min.y);
  });
});
