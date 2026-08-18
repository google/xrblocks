import * as THREE from 'three';
import {describe, expect, it} from 'vitest';

import {TagAnchorCalibrator} from './TagAnchorCalibration';

const UNIT = new THREE.Vector3(1, 1, 1);
const TAG_POSITION = new THREE.Vector3(0.5, 1.2, -2);
const TAG_ROTATION = new THREE.Quaternion().setFromEuler(
  new THREE.Euler(-0.1, 0.4, 0.05)
);
const WORLD_FROM_TAG = new THREE.Matrix4().compose(
  TAG_POSITION,
  TAG_ROTATION,
  UNIT
);

// A ground-truth calibration error the SDK camera model does not know about:
// ~2.2° of rotation, ~1.7 cm of translation, and a 0.9 range scale (the
// monocular ranges read 11% long).
const TRUE_EXTRINSIC = new THREE.Matrix4().compose(
  new THREE.Vector3(0.012, -0.006, 0.01),
  new THREE.Quaternion().setFromEuler(new THREE.Euler(-0.012, 0.035, 0.008)),
  UNIT
);
const TRUE_RANGE_SCALE = 0.9;

/**
 * Builds an observation as the tracker would: `worldFromCamera` is the SDK's
 * (miscalibrated) camera pose, while the measured camera-from-tag pose comes
 * from the true camera with its translation stretched by the range-scale
 * error.
 */
function makeObservation({
  cameraPosition,
  roll = 0,
  extrinsic = new THREE.Matrix4(),
  rangeScale = 1,
  timeMs = 0,
}: {
  cameraPosition: THREE.Vector3;
  roll?: number;
  extrinsic?: THREE.Matrix4;
  rangeScale?: number;
  timeMs?: number;
}) {
  const worldFromRealCamera = new THREE.Matrix4().lookAt(
    cameraPosition,
    TAG_POSITION,
    new THREE.Vector3(0, 1, 0)
  );
  if (roll !== 0) {
    worldFromRealCamera.multiply(new THREE.Matrix4().makeRotationZ(roll));
  }
  worldFromRealCamera.setPosition(cameraPosition);
  const worldFromCamera = new THREE.Matrix4().multiplyMatrices(
    worldFromRealCamera,
    extrinsic.clone().invert()
  );
  const cameraFromTag = worldFromRealCamera
    .clone()
    .invert()
    .multiply(WORLD_FROM_TAG);
  return {
    worldFromCamera,
    rotation: new THREE.Quaternion().setFromRotationMatrix(cameraFromTag),
    translation: new THREE.Vector3()
      .setFromMatrixPosition(cameraFromTag)
      .divideScalar(rangeScale),
    weight: 1,
    timeMs,
  };
}

function arcCameraPosition(theta: number): THREE.Vector3 {
  return new THREE.Vector3(
    TAG_POSITION.x + 1.8 * Math.sin(theta),
    TAG_POSITION.y + 0.4 + 0.3 * Math.sin(2 * theta),
    TAG_POSITION.z + 1.8 * Math.cos(theta)
  );
}

function feedArc(calibrator: TagAnchorCalibrator, count = 20) {
  for (let i = 0; i < count; ++i) {
    const theta = -0.9 + (1.8 * i) / (count - 1);
    calibrator.observe(
      makeObservation({
        cameraPosition: arcCameraPosition(theta),
        roll: 0.15 * Math.sin(3 * theta),
        extrinsic: TRUE_EXTRINSIC,
        rangeScale: TRUE_RANGE_SCALE,
        timeMs: i * 100,
      })
    );
  }
}

describe('TagAnchorCalibrator', () => {
  it('solve() returns null before any observation', () => {
    expect(new TagAnchorCalibrator().solve(0)).toBeNull();
  });

  it('seeds the tag pose from a single observation', () => {
    const calibrator = new TagAnchorCalibrator();
    calibrator.observe(makeObservation({cameraPosition: arcCameraPosition(0)}));
    expect(calibrator.initialized).toBe(true);
    const position = new THREE.Vector3().setFromMatrixPosition(
      calibrator.getWorldFromTag()
    );
    expect(position.distanceTo(TAG_POSITION)).toBeLessThan(1e-6);
  });

  it('recovers extrinsics, range scale, and the true tag pose from a walk', () => {
    const calibrator = new TagAnchorCalibrator();
    feedArc(calibrator);

    let result = null;
    for (let round = 0; round < 4; ++round) {
      result = calibrator.solve(2000, 30);
    }
    expect(result).not.toBeNull();
    expect(result!.converged).toBe(true);
    expect(result!.rmsTranslationResidualM).toBeLessThan(0.01);

    const worldFromTag = calibrator.getWorldFromTag();
    const position = new THREE.Vector3().setFromMatrixPosition(worldFromTag);
    const rotation = new THREE.Quaternion().setFromRotationMatrix(worldFromTag);
    expect(position.distanceTo(TAG_POSITION)).toBeLessThan(0.02);
    expect(rotation.angleTo(TAG_ROTATION)).toBeLessThan(0.02);

    expect(calibrator.rangeScale).toBeGreaterThan(TRUE_RANGE_SCALE - 0.02);
    expect(calibrator.rangeScale).toBeLessThan(TRUE_RANGE_SCALE + 0.02);

    // ~2.2° of true extrinsic rotation error should be substantially
    // recovered rather than absorbed into the tag pose.
    const trueRotationRad = 0.0385;
    expect(calibrator.extrinsicCorrection.rotationRad).toBeGreaterThan(
      0.6 * trueRotationRad
    );
    expect(calibrator.extrinsicCorrection.rotationRad).toBeLessThan(
      1.4 * trueRotationRad
    );
  });

  it('holds the priors while the camera is stationary', () => {
    const calibrator = new TagAnchorCalibrator();
    const cameraPosition = arcCameraPosition(0.2);
    for (let i = 0; i < 8; ++i) {
      calibrator.observe(
        makeObservation({cameraPosition, rangeScale: 0.8, timeMs: i * 100})
      );
    }
    // Identical viewpoints refresh a single keyframe instead of piling up.
    expect(calibrator.keyframeCount).toBe(1);

    const result = calibrator.solve(800, 30)!;
    expect(result.converged).toBe(false);
    // Without baseline the scale stays at the prior instead of chasing the
    // (unobservable) bias.
    expect(calibrator.rangeScale).toBeGreaterThan(0.95);
    expect(calibrator.extrinsicCorrection.rotationRad).toBeLessThan(0.01);
  });

  it('retains a restored calibration while the viewer stands still', () => {
    const calibrator = new TagAnchorCalibrator();
    calibrator.setCalibration({
      rotation: new THREE.Quaternion().setFromEuler(
        new THREE.Euler(0.01, 0.07, -0.005)
      ),
      translation: new THREE.Vector3(0.01, 0, 0.005),
      rangeScale: 0.92,
    });
    const restoredAngle = calibrator.extrinsicCorrection.rotationRad;

    // Stationary observations cannot distinguish calibration from tag pose,
    // so the priors must defend the restored values instead of washing them
    // back toward the SDK model.
    const cameraPosition = arcCameraPosition(0.1);
    for (let i = 0; i < 6; ++i) {
      calibrator.observe(makeObservation({cameraPosition, timeMs: i * 100}));
    }
    calibrator.solve(600, 30);

    expect(calibrator.rangeScale).toBeGreaterThan(0.9);
    expect(calibrator.rangeScale).toBeLessThan(0.94);
    expect(calibrator.extrinsicCorrection.rotationRad).toBeGreaterThan(
      0.8 * restoredAngle
    );
    expect(calibrator.extrinsicCorrection.rotationRad).toBeLessThan(
      1.2 * restoredAngle
    );
  });

  it('classifies a displaced tag as an outlier without ingesting it', () => {
    const calibrator = new TagAnchorCalibrator();
    feedArc(calibrator);
    calibrator.solve(2000, 30);
    const keyframesBefore = calibrator.keyframeCount;

    const displaced = makeObservation({
      cameraPosition: arcCameraPosition(0.5),
      extrinsic: TRUE_EXTRINSIC,
      rangeScale: TRUE_RANGE_SCALE,
      timeMs: 2100,
    });
    displaced.translation.z += 0.5;
    const verdict = calibrator.observe(displaced);
    expect(verdict.isOutlier).toBe(true);
    expect(verdict.ingested).toBe(false);
    expect(calibrator.keyframeCount).toBe(keyframesBefore);
  });

  it('keeps the camera calibration across a tag reset', () => {
    const calibrator = new TagAnchorCalibrator();
    calibrator.setCalibration({rangeScale: 0.85});
    calibrator.observe(makeObservation({cameraPosition: arcCameraPosition(0)}));
    calibrator.resetTag();
    expect(calibrator.initialized).toBe(false);
    expect(calibrator.keyframeCount).toBe(0);
    expect(calibrator.rangeScale).toBe(0.85);

    calibrator.resetAll();
    expect(calibrator.rangeScale).toBe(1);
  });

  it('round-trips the calibration through get/setCalibration', () => {
    const source = new TagAnchorCalibrator();
    source.setCalibration({
      rotation: new THREE.Quaternion().setFromEuler(
        new THREE.Euler(0.01, -0.02, 0.005)
      ),
      translation: new THREE.Vector3(0.01, 0.002, -0.004),
      rangeScale: 0.93,
    });
    const restored = new TagAnchorCalibrator();
    restored.setCalibration(source.getCalibration());
    expect(restored.rangeScale).toBeCloseTo(0.93, 6);
    expect(restored.extrinsicCorrection.rotationRad).toBeCloseTo(
      source.extrinsicCorrection.rotationRad,
      6
    );
  });

  it('caps the keyframe set at its maximum size', () => {
    const calibrator = new TagAnchorCalibrator();
    for (let i = 0; i < 60; ++i) {
      const theta = -1.2 + (2.4 * i) / 59;
      calibrator.observe(
        makeObservation({
          cameraPosition: arcCameraPosition(theta),
          timeMs: i * 100,
        })
      );
    }
    expect(calibrator.keyframeCount).toBeLessThanOrEqual(32);
  });
});
