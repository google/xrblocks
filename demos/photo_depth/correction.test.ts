import * as THREE from 'three';
import {describe, expect, it} from 'vitest';

import {correctionFromCalibration, describeCorrection} from './correction.js';
import {cameraPose} from './testScenes';

describe('correctionFromCalibration', () => {
  it('applies in the camera frame, like the ArUco/objects3d correction', () => {
    // A camera at eye height looking along world -x.
    const worldFromView = cameraPose(
      new THREE.Vector3(1, 1.6, 0),
      0,
      Math.PI / 2
    );
    // Push the camera 10 cm along its own viewing axis (-z in view space).
    const correction = correctionFromCalibration({
      rotation: [0, 0, 0, 1],
      translation: [0, 0, -0.1],
    });
    const corrected = worldFromView.clone().multiply(correction);
    const position = new THREE.Vector3().setFromMatrixPosition(corrected);
    expect(position.x).toBeCloseTo(0.9, 6);
    expect(position.y).toBeCloseTo(1.6, 6);
    expect(position.z).toBeCloseTo(0, 6);
  });

  it('describes the correction magnitude', () => {
    const q = new THREE.Quaternion().setFromAxisAngle(
      new THREE.Vector3(1, 0, 0),
      THREE.MathUtils.degToRad(3)
    );
    const correction = correctionFromCalibration({
      rotation: q.toArray() as [number, number, number, number],
      translation: [0.03, 0, 0.04],
    });
    const {rotationDeg, translationCm} = describeCorrection(correction);
    expect(rotationDeg).toBeCloseTo(3, 6);
    expect(translationCm).toBeCloseTo(5, 6);
  });
});
