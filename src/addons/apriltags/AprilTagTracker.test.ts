import * as THREE from 'three';
import {afterEach, describe, expect, it, vi} from 'vitest';

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

const {
  AprilTagTracker,
  DEFAULT_TAG25H9_ID,
  DEFAULT_TAG25H9_SIZE_METERS,
  getAprilTagCameraIntrinsics,
  getWorldFromAprilTagPose,
  aprilTagCalibrationStorageKey,
  loadPersistedAprilTagCalibration,
} = await import('./AprilTagTracker');

describe('AprilTagTracker', () => {
  it('uses the printed tag size and ID 17 by default', () => {
    const tracker = new AprilTagTracker();

    expect(tracker.tagId).toBe(DEFAULT_TAG25H9_ID);
    expect(tracker.tagSizeMeters).toBe(DEFAULT_TAG25H9_SIZE_METERS);
    expect(tracker.hasAnchor).toBe(false);
    expect(tracker.visible).toBe(false);
    expect(tracker.estimatedRangeScale).toBe(1);
  });

  it('derives pinhole intrinsics from a Three.js projection', () => {
    const camera = new THREE.PerspectiveCamera(90, 2, 0.1, 10);
    camera.updateProjectionMatrix();

    const intrinsics = getAprilTagCameraIntrinsics(
      camera.projectionMatrix,
      200,
      100
    );
    expect(intrinsics.fx).toBeCloseTo(50);
    expect(intrinsics.fy).toBeCloseTo(50);
    expect(intrinsics.cx).toBeCloseTo(100);
    expect(intrinsics.cy).toBeCloseTo(50);
  });

  it('converts a computer-vision tag pose into Three.js world coordinates', () => {
    const worldFromView = new THREE.Matrix4().makeTranslation(3, 4, 5);
    const worldFromTag = getWorldFromAprilTagPose(
      {
        // A tag rotation that exactly cancels the camera-frame conversion,
        // so the resulting world orientation is the identity.
        rotation: [1, 0, 0, 0, -1, 0, 0, 0, -1],
        translation: [0.1, 0.2, 1],
      },
      worldFromView
    );

    expect(new THREE.Vector3().setFromMatrixPosition(worldFromTag)).toEqual(
      new THREE.Vector3(3.1, 3.8, 4)
    );
    expect(new THREE.Quaternion().setFromRotationMatrix(worldFromTag)).toEqual(
      new THREE.Quaternion()
    );
  });

  it('clears a retained anchor when selecting another ID', () => {
    const tracker = new AprilTagTracker();
    tracker.setTagId(18);

    expect(tracker.tagId).toBe(18);
    expect(tracker.hasAnchor).toBe(false);
    expect(tracker.state).toBe('searching');
  });

  it('does not touch the worker or state while detection is paused', () => {
    const tracker = new AprilTagTracker();
    expect(tracker.isDetectionPaused).toBe(false);

    tracker.setDetectionPaused(true);
    expect(tracker.isDetectionPaused).toBe(true);
    tracker.update(1000);
    // The pause gate returns before startWorker()/requestDetection(), so
    // nothing has moved the state machine past its initial value.
    expect(tracker.state).toBe('initializing');

    tracker.setDetectionPaused(false);
    expect(tracker.isDetectionPaused).toBe(false);
  });

  it('getCalibration() round-trips a pinned constructor calibration', () => {
    const pinned = {
      rotation: [0, 0.0871557, 0, 0.9961947] as [
        number,
        number,
        number,
        number,
      ], // ~10° yaw
      translation: [0.01, -0.02, 0.03] as [number, number, number],
      rangeScale: 0.9,
    };
    const tracker = new AprilTagTracker({calibration: pinned});
    const readBack = tracker.getCalibration();

    for (let i = 0; i < 4; ++i) {
      expect(readBack.rotation[i]).toBeCloseTo(pinned.rotation[i], 6);
    }
    for (let i = 0; i < 3; ++i) {
      expect(readBack.translation[i]).toBeCloseTo(pinned.translation[i], 6);
    }
    expect(readBack.rangeScale).toBeCloseTo(pinned.rangeScale, 6);

    // The shape returned is exactly the shape the constructor accepts.
    const tracker2 = new AprilTagTracker({calibration: readBack});
    const readBack2 = tracker2.getCalibration();
    for (let i = 0; i < 4; ++i) {
      expect(readBack2.rotation[i]).toBeCloseTo(readBack.rotation[i], 6);
    }
    for (let i = 0; i < 3; ++i) {
      expect(readBack2.translation[i]).toBeCloseTo(readBack.translation[i], 6);
    }
  });
});

describe('aprilTagCalibrationStorageKey', () => {
  it('matches the versioned per-device key format', () => {
    expect(aprilTagCalibrationStorageKey('galaxyxr')).toBe(
      'xrblocks:apriltags:calibration:v1:galaxyxr'
    );
    expect(aprilTagCalibrationStorageKey('quest3')).toBe(
      'xrblocks:apriltags:calibration:v1:quest3'
    );
  });
});

describe('loadPersistedAprilTagCalibration', () => {
  const targetDevice = 'unit-test-device';
  const key = aprilTagCalibrationStorageKey(targetDevice);

  afterEach(() => {
    localStorage.removeItem(key);
  });

  it('returns null when nothing is stored', () => {
    expect(loadPersistedAprilTagCalibration(targetDevice)).toBeNull();
  });

  it('parses a valid stored payload', () => {
    localStorage.setItem(
      key,
      JSON.stringify({
        v: 1,
        rotation: [0, 0, 0, 1],
        translation: [0.01, 0.02, 0],
        rangeScale: 0.95,
        tagSizeMeters: 0.1556,
      })
    );
    expect(loadPersistedAprilTagCalibration(targetDevice)).toEqual({
      rotation: [0, 0, 0, 1],
      translation: [0.01, 0.02, 0],
      rangeScale: 0.95,
      tagSizeMeters: 0.1556,
    });
  });

  it('rejects a mismatched storage version', () => {
    localStorage.setItem(
      key,
      JSON.stringify({
        v: 2,
        rotation: [0, 0, 0, 1],
        translation: [0, 0, 0],
      })
    );
    expect(loadPersistedAprilTagCalibration(targetDevice)).toBeNull();
  });

  it('rejects malformed rotation/translation arrays', () => {
    localStorage.setItem(
      key,
      JSON.stringify({v: 1, rotation: [0, 0, 0], translation: [0, 0, 0]})
    );
    expect(loadPersistedAprilTagCalibration(targetDevice)).toBeNull();
  });

  it('rejects non-finite values', () => {
    localStorage.setItem(
      key,
      JSON.stringify({
        v: 1,
        rotation: [0, 0, 0, NaN],
        translation: [0, 0, 0],
      })
    );
    expect(loadPersistedAprilTagCalibration(targetDevice)).toBeNull();
  });
});
