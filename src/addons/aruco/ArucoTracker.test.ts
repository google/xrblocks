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

const {ArucoTracker, getWorldFromArucoPose, createArucoAnchorVisuals} =
  await import('./ArucoTracker');

describe('ArucoTracker', () => {
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
});
