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
  ARUCO_DICTIONARY_SIZES,
  ArucoTracker,
  DEFAULT_ARUCO_DICTIONARY,
  DEFAULT_ARUCO_MARKER_ID,
  DEFAULT_ARUCO_MARKER_SIZE_METERS,
  getArucoCameraIntrinsics,
  getWorldFromArucoPose,
  arucoCalibrationStorageKey,
  createArucoAnchorVisuals,
  loadPersistedArucoCalibration,
} = await import('./ArucoTracker');

describe('ArucoTracker', () => {
  it('uses the 36h12 dictionary, ID 0 and a 15 cm marker by default', () => {
    const tracker = new ArucoTracker();

    expect(tracker.dictionary).toBe(DEFAULT_ARUCO_DICTIONARY);
    expect(tracker.dictionary).toBe('ARUCO_MIP_36h12');
    expect(tracker.markerId).toBe(DEFAULT_ARUCO_MARKER_ID);
    expect(tracker.markerSizeMeters).toBe(DEFAULT_ARUCO_MARKER_SIZE_METERS);
    expect(tracker.hasAnchor).toBe(false);
    expect(tracker.visible).toBe(false);
    expect(tracker.estimatedRangeScale).toBe(1);
  });

  it('derives pinhole intrinsics from a Three.js projection', () => {
    const camera = new THREE.PerspectiveCamera(90, 2, 0.1, 10);
    camera.updateProjectionMatrix();

    const intrinsics = getArucoCameraIntrinsics(
      camera.projectionMatrix,
      200,
      100
    );
    expect(intrinsics.fx).toBeCloseTo(50);
    expect(intrinsics.fy).toBeCloseTo(50);
    expect(intrinsics.cx).toBeCloseTo(100);
    expect(intrinsics.cy).toBeCloseTo(50);
  });

  it('converts a computer-vision marker pose into Three.js world coordinates', () => {
    const worldFromView = new THREE.Matrix4().makeTranslation(3, 4, 5);
    const worldFromTag = getWorldFromArucoPose(
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
    const tracker = new ArucoTracker();
    tracker.setMarkerId(18);

    expect(tracker.markerId).toBe(18);
    expect(tracker.hasAnchor).toBe(false);
    expect(tracker.state).toBe('searching');
  });

  it('validates marker IDs against the active dictionary', () => {
    const tracker = new ArucoTracker();
    const last36h12 = ARUCO_DICTIONARY_SIZES.ARUCO_MIP_36h12 - 1;
    expect(() => tracker.setMarkerId(last36h12)).not.toThrow();
    expect(() => tracker.setMarkerId(last36h12 + 1)).toThrow(RangeError);
    expect(() => tracker.setMarkerId(-1)).toThrow(RangeError);
    expect(() => tracker.setMarkerId(1.5)).toThrow(RangeError);

    tracker.setDictionary('ARUCO');
    expect(() => tracker.setMarkerId(1022)).not.toThrow();
    expect(() => tracker.setMarkerId(1023)).toThrow(RangeError);
    expect(
      () => new ArucoTracker({dictionary: 'ARUCO', markerId: 900})
    ).not.toThrow();
    expect(() => new ArucoTracker({markerId: 900})).toThrow(RangeError);
  });

  it('switching dictionary clears the anchor and clamps the ID', () => {
    const tracker = new ArucoTracker({dictionary: 'ARUCO', markerId: 900});
    expect(tracker.maxHamming).toBe(0);

    tracker.setDictionary('ARUCO_MIP_36h12');
    expect(tracker.dictionary).toBe('ARUCO_MIP_36h12');
    expect(tracker.markerId).toBe(249);
    expect(tracker.maxHamming).toBe(4);
    expect(tracker.hasAnchor).toBe(false);
    expect(tracker.state).toBe('searching');
    expect(tracker.status).toContain('ARUCO_MIP_36h12 ID 249');

    expect(() =>
      tracker.setDictionary('tag25h9' as unknown as 'ARUCO')
    ).toThrow(RangeError);
  });

  it('honours an explicit maxHamming across dictionaries', () => {
    const tracker = new ArucoTracker({maxHamming: 2});
    expect(tracker.maxHamming).toBe(2);
    tracker.setDictionary('ARUCO');
    expect(tracker.maxHamming).toBe(2);
  });

  it('does not touch the worker or state while detection is paused', () => {
    const tracker = new ArucoTracker();
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

  it('dispose() releases overlays parented to the anchor', () => {
    const tracker = new ArucoTracker();
    const visuals = createArucoAnchorVisuals();
    tracker.add(visuals);
    const mesh = visuals.children.find(
      (child): child is THREE.Mesh => child instanceof THREE.Mesh
    )!;
    const geometryDispose = vi.spyOn(mesh.geometry, 'dispose');
    const materialDispose = vi.spyOn(
      mesh.material as THREE.Material,
      'dispose'
    );

    tracker.dispose();

    expect(geometryDispose).toHaveBeenCalledTimes(1);
    expect(materialDispose).toHaveBeenCalledTimes(1);
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
    const tracker = new ArucoTracker({calibration: pinned});
    const readBack = tracker.getCalibration();

    for (let i = 0; i < 4; ++i) {
      expect(readBack.rotation[i]).toBeCloseTo(pinned.rotation[i], 6);
    }
    for (let i = 0; i < 3; ++i) {
      expect(readBack.translation[i]).toBeCloseTo(pinned.translation[i], 6);
    }
    expect(readBack.rangeScale).toBeCloseTo(pinned.rangeScale, 6);

    // The shape returned is exactly the shape the constructor accepts.
    const tracker2 = new ArucoTracker({calibration: readBack});
    const readBack2 = tracker2.getCalibration();
    for (let i = 0; i < 4; ++i) {
      expect(readBack2.rotation[i]).toBeCloseTo(readBack.rotation[i], 6);
    }
    for (let i = 0; i < 3; ++i) {
      expect(readBack2.translation[i]).toBeCloseTo(readBack.translation[i], 6);
    }
  });
});

describe('arucoCalibrationStorageKey', () => {
  it('matches the versioned per-device key format', () => {
    expect(arucoCalibrationStorageKey('galaxyxr')).toBe(
      'xrblocks:aruco:calibration:v1:galaxyxr'
    );
    expect(arucoCalibrationStorageKey('quest3')).toBe(
      'xrblocks:aruco:calibration:v1:quest3'
    );
  });
});

describe('loadPersistedArucoCalibration', () => {
  const targetDevice = 'unit-test-device';
  const key = arucoCalibrationStorageKey(targetDevice);

  afterEach(() => {
    localStorage.removeItem(key);
  });

  it('returns null when nothing is stored', () => {
    expect(loadPersistedArucoCalibration(targetDevice)).toBeNull();
  });

  it('parses a valid stored payload', () => {
    localStorage.setItem(
      key,
      JSON.stringify({
        v: 1,
        rotation: [0, 0, 0, 1],
        translation: [0.01, 0.02, 0],
        rangeScale: 0.95,
        markerSizeMeters: 0.1556,
      })
    );
    expect(loadPersistedArucoCalibration(targetDevice)).toEqual({
      rotation: [0, 0, 0, 1],
      translation: [0.01, 0.02, 0],
      rangeScale: 0.95,
      markerSizeMeters: 0.1556,
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
    expect(loadPersistedArucoCalibration(targetDevice)).toBeNull();
  });

  it('rejects malformed rotation/translation arrays', () => {
    localStorage.setItem(
      key,
      JSON.stringify({v: 1, rotation: [0, 0, 0], translation: [0, 0, 0]})
    );
    expect(loadPersistedArucoCalibration(targetDevice)).toBeNull();
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
    expect(loadPersistedArucoCalibration(targetDevice)).toBeNull();
  });
});
