import * as THREE from 'three';
import {describe, it, expect} from 'vitest';

import {
  DetectedFace,
  FaceBlendshape,
  FaceLandmark,
  FaceLandmarkName,
} from './DetectedFace';

// Build a 478-entry landmark array with a few specific indices populated.
// Anything not named defaults to (0,0,0) with no worldPosition. The model
// always emits 478 entries (468 mesh + 10 iris); tests should stay
// representative of that shape.
function makeLandmarks(
  populated: Record<number, [number, number, number, [number, number, number]?]>
): FaceLandmark[] {
  const out: FaceLandmark[] = [];
  for (let i = 0; i < 478; i++) {
    const entry = populated[i];
    if (entry) {
      const [x, y, z, wp] = entry;
      out.push({
        x,
        y,
        z,
        worldPosition: wp ? new THREE.Vector3(wp[0], wp[1], wp[2]) : undefined,
      });
    } else {
      out.push({x: 0, y: 0, z: 0});
    }
  }
  return out;
}

function makeBbox(): THREE.Box2 {
  return new THREE.Box2(
    new THREE.Vector2(0.3, 0.2),
    new THREE.Vector2(0.7, 0.8)
  );
}

describe('DetectedFace', () => {
  it('defaults Object3D position to the projected nose-tip world position', () => {
    // Mesh index 1 is the canonical nose tip in MediaPipe's face mesh.
    const landmarks = makeLandmarks({1: [0.5, 0.5, 0, [0.1, 1.6, -0.4]]});
    const face = new DetectedFace(0, landmarks, makeBbox());
    expect(face.position.x).toBeCloseTo(0.1);
    expect(face.position.y).toBeCloseTo(1.6);
    expect(face.position.z).toBeCloseTo(-0.4);
  });

  it('leaves position at origin when nose tip has no world projection', () => {
    // Provide screen coords but no worldPosition: depth raycast missed.
    const landmarks = makeLandmarks({1: [0.5, 0.5, 0]});
    const face = new DetectedFace(0, landmarks, makeBbox());
    expect(face.position.x).toBe(0);
    expect(face.position.y).toBe(0);
    expect(face.position.z).toBe(0);
  });

  it('decomposes the facial transformation matrix onto position/quaternion/scale when present', () => {
    const landmarks = makeLandmarks({1: [0.5, 0.5, 0, [0.1, 1.6, -0.4]]});
    // Translation-only matrix at (0.5, 1.8, -0.7), no rotation, no scale.
    const mat = new THREE.Matrix4().makeTranslation(0.5, 1.8, -0.7);
    const face = new DetectedFace(0, landmarks, makeBbox(), [], mat);
    // Decomposed translation should override the nose-tip default.
    expect(face.position.x).toBeCloseTo(0.5);
    expect(face.position.y).toBeCloseTo(1.8);
    expect(face.position.z).toBeCloseTo(-0.7);
    expect(face.scale.x).toBeCloseTo(1);
  });

  it('getLandmarkPosition returns world coords for named anchors', () => {
    // Populate the canonical indices for nose tip (1) and left pupil (473).
    const landmarks = makeLandmarks({
      1: [0.5, 0.5, 0, [0, 1.6, -0.5]],
      473: [0.55, 0.45, 0, [0.02, 1.62, -0.5]],
    });
    const face = new DetectedFace(0, landmarks, makeBbox());
    const nose = face.getLandmarkPosition(FaceLandmarkName.NoseTip);
    expect(nose).not.toBeNull();
    expect(nose!.x).toBeCloseTo(0);

    const leftPupil = face.getLandmarkPosition(FaceLandmarkName.LeftPupil);
    expect(leftPupil).not.toBeNull();
    expect(leftPupil!.x).toBeCloseTo(0.02);
  });

  it('getLandmarkPosition returns null when the landmark has no world projection', () => {
    const landmarks = makeLandmarks({1: [0.5, 0.5, 0]}); // no worldPosition
    const face = new DetectedFace(0, landmarks, makeBbox());
    expect(face.getLandmarkPosition(FaceLandmarkName.NoseTip)).toBeNull();
  });

  it('getBlendshape looks up by ARKit category name and falls back to 0', () => {
    const landmarks = makeLandmarks({});
    const blendshapes: FaceBlendshape[] = [
      {categoryName: 'jawOpen', score: 0.7},
      {categoryName: 'mouthSmileLeft', score: 0.2},
    ];
    const face = new DetectedFace(0, landmarks, makeBbox(), blendshapes);
    expect(face.getBlendshape('jawOpen')).toBeCloseTo(0.7);
    expect(face.getBlendshape('mouthSmileLeft')).toBeCloseTo(0.2);
    // Unknown / unemitted categories: 0, not undefined.
    expect(face.getBlendshape('mouthSmileRight')).toBe(0);
    expect(face.getBlendshape('notARealBlendshape')).toBe(0);
  });
});
