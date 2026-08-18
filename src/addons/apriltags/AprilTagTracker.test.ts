import * as THREE from 'three';
import {describe, expect, it, vi} from 'vitest';

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
});
