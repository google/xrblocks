import {describe, expect, it} from 'vitest';
import * as THREE from 'three';

import {Simulator} from './Simulator';
import {SimulatorOptions} from './SimulatorOptions';

function diagonalFov(camera: THREE.PerspectiveCamera): number {
  const verticalTangent = Math.tan((camera.fov * Math.PI) / 360);
  return (
    (2 *
      Math.atan(
        Math.sqrt((camera.aspect * verticalTangent) ** 2 + verticalTangent ** 2)
      ) *
      180) /
    Math.PI
  );
}

describe('Simulator glasses diagonal FOV', () => {
  it('uses a numeric diagonal FOV and restores the default when unset', () => {
    const simulator = new Simulator(() => {});
    const camera = new THREE.PerspectiveCamera(50, 16 / 9);
    simulator.mainCamera = camera;
    simulator.options = new SimulatorOptions({displayDiagonalFov: 51});
    simulator['defaultCameraFov'] = camera.fov;

    simulator['applyDisplayFov']();
    expect(diagonalFov(camera)).toBeCloseTo(51, 5);

    camera.aspect = 1.2;
    simulator['applyDisplayFov']();
    expect(diagonalFov(camera)).toBeCloseTo(51, 5);

    simulator.options.displayDiagonalFov = 70;
    simulator['applyDisplayFov']();
    expect(diagonalFov(camera)).toBeCloseTo(70, 5);

    simulator.options.displayDiagonalFov = undefined;
    simulator['applyDisplayFov']();
    expect(camera.fov).toBe(50);
  });

  it('rejects an invalid diagonal FOV', () => {
    const simulator = new Simulator(() => {});
    simulator.mainCamera = new THREE.PerspectiveCamera(50, 16 / 9);
    simulator.options = new SimulatorOptions({displayDiagonalFov: 180});
    simulator['defaultCameraFov'] = 50;

    expect(() => simulator['applyDisplayFov']()).toThrow(
      /displayDiagonalFov must be greater than 0/
    );
  });

  it('syncs both stereo camera projections when FOV or aspect changes', () => {
    const simulator = new Simulator(() => {});
    const camera = new THREE.PerspectiveCamera(50, 16 / 9);
    simulator.mainCamera = camera;
    simulator.options = new SimulatorOptions({
      displayDiagonalFov: 70,
      stereo: {enabled: true},
    });
    simulator['defaultCameraFov'] = camera.fov;
    simulator['applyDisplayFov']();
    simulator.setupStereoCameras(camera);

    camera.aspect = 1.25;
    simulator['applyDisplayFov']();
    for (const eyeCamera of simulator.stereoCameras) {
      expect(eyeCamera).toMatchObject({fov: camera.fov, aspect: camera.aspect});
    }

    simulator.options.displayDiagonalFov = 88;
    simulator['applyDisplayFov']();
    for (const eyeCamera of simulator.stereoCameras) {
      expect(eyeCamera).toMatchObject({fov: camera.fov, aspect: camera.aspect});
    }
  });
});
