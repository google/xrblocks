import {describe, expect, it, vi} from 'vitest';

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

const {applyCameraPoseCorrections} = await import('./Object3DDetector');

describe('applyCameraPoseCorrections', () => {
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
