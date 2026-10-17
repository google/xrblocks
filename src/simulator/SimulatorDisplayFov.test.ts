import {describe, expect, it} from 'vitest';
import * as THREE from 'three';

import {Simulator} from './Simulator';
import {
  MAX_DISPLAY_DIAGONAL_FOV_DEGREES,
  MIN_DISPLAY_DIAGONAL_FOV_DEGREES,
} from './SimulatorConstants';
import {SimulatorOptions} from './SimulatorOptions';

const DEFAULT_TEST_VERTICAL_FOV_DEGREES = 50;
const SPECTACLES_2027_DIAGONAL_FOV_DEGREES = 51;
const AURA_DIAGONAL_FOV_DEGREES = 70;
const UPDATED_DIAGONAL_FOV_DEGREES = 88;
const INITIAL_CAMERA_ASPECT_RATIO = 16 / 9;
const RESIZED_CAMERA_ASPECT_RATIO = 1.2;
const STEREO_CAMERA_ASPECT_RATIO = 1.25;
const FOV_ASSERTION_PRECISION = 5;

function diagonalFov(camera: THREE.PerspectiveCamera): number {
  const verticalTangent = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  return THREE.MathUtils.radToDeg(
    2 * Math.atan(Math.hypot(camera.aspect * verticalTangent, verticalTangent))
  );
}

describe('Simulator glasses diagonal FOV', () => {
  it('uses a numeric diagonal FOV and restores the default when unset', () => {
    const simulator = new Simulator(() => {});
    const camera = new THREE.PerspectiveCamera(
      DEFAULT_TEST_VERTICAL_FOV_DEGREES,
      INITIAL_CAMERA_ASPECT_RATIO
    );
    simulator.mainCamera = camera;
    simulator.options = new SimulatorOptions({
      displayDiagonalFov: SPECTACLES_2027_DIAGONAL_FOV_DEGREES,
    });
    simulator['defaultCameraFov'] = camera.fov;

    simulator['applyDisplayFov']();
    expect(diagonalFov(camera)).toBeCloseTo(
      SPECTACLES_2027_DIAGONAL_FOV_DEGREES,
      FOV_ASSERTION_PRECISION
    );

    camera.aspect = RESIZED_CAMERA_ASPECT_RATIO;
    simulator['applyDisplayFov']();
    expect(diagonalFov(camera)).toBeCloseTo(
      SPECTACLES_2027_DIAGONAL_FOV_DEGREES,
      FOV_ASSERTION_PRECISION
    );

    simulator.options.displayDiagonalFov = AURA_DIAGONAL_FOV_DEGREES;
    simulator['applyDisplayFov']();
    expect(diagonalFov(camera)).toBeCloseTo(
      AURA_DIAGONAL_FOV_DEGREES,
      FOV_ASSERTION_PRECISION
    );

    simulator.options.displayDiagonalFov = undefined;
    simulator['applyDisplayFov']();
    expect(camera.fov).toBe(DEFAULT_TEST_VERTICAL_FOV_DEGREES);
  });

  it('rejects an invalid diagonal FOV', () => {
    const simulator = new Simulator(() => {});
    simulator.mainCamera = new THREE.PerspectiveCamera(
      DEFAULT_TEST_VERTICAL_FOV_DEGREES,
      INITIAL_CAMERA_ASPECT_RATIO
    );
    simulator.options = new SimulatorOptions({
      displayDiagonalFov: MAX_DISPLAY_DIAGONAL_FOV_DEGREES,
    });
    simulator['defaultCameraFov'] = DEFAULT_TEST_VERTICAL_FOV_DEGREES;

    expect(() => simulator['applyDisplayFov']()).toThrow(
      new RegExp(
        `displayDiagonalFov must be greater than ${MIN_DISPLAY_DIAGONAL_FOV_DEGREES}`
      )
    );
  });

  it('syncs both stereo camera projections when FOV or aspect changes', () => {
    const simulator = new Simulator(() => {});
    const camera = new THREE.PerspectiveCamera(
      DEFAULT_TEST_VERTICAL_FOV_DEGREES,
      INITIAL_CAMERA_ASPECT_RATIO
    );
    simulator.mainCamera = camera;
    simulator.options = new SimulatorOptions({
      displayDiagonalFov: AURA_DIAGONAL_FOV_DEGREES,
      stereo: {enabled: true},
    });
    simulator['defaultCameraFov'] = camera.fov;
    simulator['applyDisplayFov']();
    simulator.setupStereoCameras(camera);

    camera.aspect = STEREO_CAMERA_ASPECT_RATIO;
    simulator['applyDisplayFov']();
    for (const eyeCamera of simulator.stereoCameras) {
      expect(eyeCamera).toMatchObject({fov: camera.fov, aspect: camera.aspect});
    }

    simulator.options.displayDiagonalFov = UPDATED_DIAGONAL_FOV_DEGREES;
    simulator['applyDisplayFov']();
    for (const eyeCamera of simulator.stereoCameras) {
      expect(eyeCamera).toMatchObject({fov: camera.fov, aspect: camera.aspect});
    }
  });
});
