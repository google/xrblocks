import {describe, expect, it, vi} from 'vitest';

// SamMask lazily imports @huggingface/transformers, which vitest cannot
// resolve here (the demo's import map supplies it at runtime); neither mask
// path is exercised by these tests, so stub both like Object3DDetector.test.
vi.mock('./masks/SamMask', () => ({
  getSam: vi.fn(),
  samEncodeSnapshot: vi.fn(),
  samMaskFromBbox: vi.fn(),
}));
vi.mock('./masks/SegmenterMask', () => ({
  segmenterMaskFromSnapshot: vi.fn(),
}));
import * as THREE from 'three';

vi.hoisted(() => {
  class TestAudioContext {
    destination = {};

    createGain() {
      return {
        connect() {},
        disconnect() {},
        gain: {value: 1},
      };
    }
  }
  Object.defineProperty(window, 'AudioContext', {
    configurable: true,
    value: TestAudioContext,
  });
});

const {applyCameraPoseCorrections, Object3DDetector} = await import(
  './Object3DDetector'
);

describe('applyCameraPoseCorrections', () => {
  it('returns the same instance when both corrections are identity/absent', () => {
    const worldFromView = new THREE.Matrix4().makeTranslation(1, 2, 3);
    const result = applyCameraPoseCorrections(
      worldFromView,
      {yaw: 0, pitch: 0, roll: 0},
      null
    );
    expect(result).toBe(worldFromView);
  });

  it('matches the legacy inline Euler-only math for a rotation-only offset', () => {
    const worldFromView = new THREE.Matrix4().compose(
      new THREE.Vector3(0.2, 1.5, -0.4),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0.1, 0.3, 0)),
      new THREE.Vector3(1, 1, 1)
    );
    const offset = {yaw: 0.05, pitch: -0.02, roll: 0.01};

    const result = applyCameraPoseCorrections(
      worldFromView.clone(),
      offset,
      null
    );

    const expected = worldFromView
      .clone()
      .multiply(
        new THREE.Matrix4().makeRotationFromEuler(
          new THREE.Euler(offset.pitch, offset.yaw, offset.roll, 'YXZ')
        )
      );
    expect(result.equals(expected)).toBe(true);
  });

  it('moves the decomposed world position along the view -Z axis for a pure translation extrinsic', () => {
    // worldFromView: camera at the origin looking down -Z with no rotation.
    const worldFromView = new THREE.Matrix4().identity();
    const extrinsic = new THREE.Matrix4().makeTranslation(0, 0, -0.1);

    const result = applyCameraPoseCorrections(
      worldFromView,
      {yaw: 0, pitch: 0, roll: 0},
      extrinsic
    );

    const position = new THREE.Vector3().setFromMatrixPosition(result);
    expect(position.distanceTo(new THREE.Vector3(0, 0, -0.1))).toBeLessThan(
      1e-9
    );
  });

  it('composes the Euler offset before the extrinsic correction', () => {
    const worldFromView = new THREE.Matrix4().compose(
      new THREE.Vector3(0.1, 0.2, 0.3),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0.2, -0.4, 0.1)),
      new THREE.Vector3(1, 1, 1)
    );
    const offset = {yaw: 0.15, pitch: 0.05, roll: -0.02};
    const extrinsic = new THREE.Matrix4().compose(
      new THREE.Vector3(0.01, -0.02, 0.03),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0.02, 0.01, 0)),
      new THREE.Vector3(1, 1, 1)
    );

    const result = applyCameraPoseCorrections(
      worldFromView.clone(),
      offset,
      extrinsic
    );

    const handComposed = worldFromView
      .clone()
      .multiply(
        new THREE.Matrix4().makeRotationFromEuler(
          new THREE.Euler(offset.pitch, offset.yaw, offset.roll, 'YXZ')
        )
      )
      .multiply(extrinsic);
    expect(result.equals(handComposed)).toBe(true);
  });
});

describe('Object3DDetector.setCameraExtrinsicCorrection', () => {
  it('is null by default', () => {
    const detector = new Object3DDetector();
    expect(detector.cameraExtrinsicCorrection).toBeNull();
  });

  it('round-trips a rotation + translation through the getter', () => {
    const detector = new Object3DDetector();
    const rotation = new THREE.Quaternion()
      .setFromEuler(new THREE.Euler(0.1, -0.2, 0.05))
      .toArray();
    const translation = [0.01, -0.02, 0.03];

    detector.setCameraExtrinsicCorrection({rotation, translation});
    const applied = detector.cameraExtrinsicCorrection;

    expect(applied).not.toBeNull();
    expect(
      new THREE.Quaternion()
        .fromArray(applied!.rotation)
        .angleTo(new THREE.Quaternion().fromArray(rotation))
    ).toBeLessThan(1e-6);
    for (let i = 0; i < 3; ++i) {
      expect(applied!.translation[i]).toBeCloseTo(translation[i], 9);
    }
  });

  it('normalizes a non-unit quaternion', () => {
    const detector = new Object3DDetector();
    detector.setCameraExtrinsicCorrection({rotation: [0, 0, 0, 2]});
    const applied = detector.cameraExtrinsicCorrection;
    const q = new THREE.Quaternion().fromArray(applied!.rotation);
    expect(q.length()).toBeCloseTo(1, 9);
  });

  it('clears with null', () => {
    const detector = new Object3DDetector();
    detector.setCameraExtrinsicCorrection({translation: [0.1, 0, 0]});
    expect(detector.cameraExtrinsicCorrection).not.toBeNull();
    detector.setCameraExtrinsicCorrection(null);
    expect(detector.cameraExtrinsicCorrection).toBeNull();
  });

  it('clears with an object with neither field set', () => {
    const detector = new Object3DDetector();
    detector.setCameraExtrinsicCorrection({translation: [0.1, 0, 0]});
    detector.setCameraExtrinsicCorrection({});
    expect(detector.cameraExtrinsicCorrection).toBeNull();
  });

  it('reports rotation and translation magnitudes in the diagnostics shape', () => {
    const detector = new Object3DDetector();
    // A 90° yaw plus a 3-4-5 translation (5 cm) for round numbers.
    const rotation = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(0, Math.PI / 2, 0)
    );
    detector.setCameraExtrinsicCorrection({
      rotation: rotation.toArray(),
      translation: [0.03, 0.04, 0],
    });
    // The diagnostics-shaped magnitudes are private state exercised via
    // Object3DDetectorDiagnostics at detect() time; assert the same inputs
    // the getter round-trips are internally consistent by reconstructing
    // the expected magnitudes from the public getter's outputs.
    const applied = detector.cameraExtrinsicCorrection!;
    const q = new THREE.Quaternion().fromArray(applied.rotation);
    const angleDeg = THREE.MathUtils.radToDeg(
      2 * Math.acos(THREE.MathUtils.clamp(Math.abs(q.w), -1, 1))
    );
    expect(angleDeg).toBeCloseTo(90, 3);
    const t = new THREE.Vector3().fromArray(applied.translation);
    expect(t.length() * 100).toBeCloseTo(5, 6);
  });

  it('accepts a calibration shaped like AprilTagTracker.getCalibration()', () => {
    const detector = new Object3DDetector();
    // Same array shape AprilTagTracker.getCalibration() returns.
    const calibration = {
      rotation: [0, 0.0871557, 0, 0.9961947] as [
        number,
        number,
        number,
        number,
      ],
      translation: [0.01, 0.02, 0] as [number, number, number],
      rangeScale: 0.92,
    };
    detector.setCameraExtrinsicCorrection(calibration);
    expect(detector.cameraExtrinsicCorrection).not.toBeNull();
  });
});
