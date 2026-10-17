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

describe('Simulator glasses display presets', () => {
  it('approximates the diagonal field of view and restores the default', () => {
    const simulator = new Simulator(() => {});
    const camera = new THREE.PerspectiveCamera(50, 16 / 9);
    simulator.mainCamera = camera;
    simulator.options = new SimulatorOptions({displayPreset: 'spectacles'});
    simulator['defaultCameraFov'] = camera.fov;

    simulator['applyDisplayPreset']();
    expect(diagonalFov(camera)).toBeCloseTo(46, 5);

    camera.aspect = 1.2;
    simulator['applyDisplayPreset']();
    expect(diagonalFov(camera)).toBeCloseTo(46, 5);

    simulator.options.displayPreset = 'aura';
    simulator['applyDisplayPreset']();
    expect(diagonalFov(camera)).toBeCloseTo(70, 5);

    simulator.options.displayPreset = 'default';
    simulator['applyDisplayPreset']();
    expect(camera.fov).toBe(50);
  });
});
