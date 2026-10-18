import {describe, expect, it} from 'vitest';
import * as THREE from 'three';

import {
  AVERAGE_IPD_METERS,
  MAX_DISPLAY_DIAGONAL_FOV_DEGREES,
  MIN_DISPLAY_DIAGONAL_FOV_DEGREES,
} from './SimulatorConstants';
import {SimulatorDisplayFov} from './SimulatorDisplayFov';
import {SimulatorOptions} from './SimulatorOptions';

const DEFAULT_TEST_VERTICAL_FOV_DEGREES = 50;
const SPECTACLES_2027_DIAGONAL_FOV_DEGREES = 51;
const AURA_DIAGONAL_FOV_DEGREES = 70;
const UPDATED_DIAGONAL_FOV_DEGREES = 88;
const INITIAL_CAMERA_ASPECT_RATIO = 16 / 9;
const RESIZED_CAMERA_ASPECT_RATIO = 1.2;
const STEREO_CAMERA_ASPECT_RATIO = 1.25;
const APP_CAMERA_ASPECT_RATIO = 1.4;
const APP_CAMERA_NEAR = 0.2;
const APP_CAMERA_FAR = 900;
const APP_CAMERA_ZOOM = 1.1;
const UPDATED_CAMERA_NEAR = 0.15;
const UPDATED_CAMERA_FAR = 750;
const UPDATED_CAMERA_ZOOM = 1.25;
const PROJECTION_HORIZONTAL_OFFSET_INDEX = 8;
const STEREO_PROJECTION_HORIZONTAL_OFFSET = 0.01;
const FOV_ASSERTION_PRECISION = 5;
const LEFT_EYE_OFFSET = new THREE.Vector3(-AVERAGE_IPD_METERS / 2, 0, 0);
const RIGHT_EYE_OFFSET = new THREE.Vector3(AVERAGE_IPD_METERS / 2, 0, 0);

function diagonalFov(camera: THREE.PerspectiveCamera): number {
  const verticalTangent = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  return THREE.MathUtils.radToDeg(
    2 * Math.atan(Math.hypot(camera.aspect * verticalTangent, verticalTangent))
  );
}

function createDisplayFov(
  camera: THREE.Camera,
  options: SimulatorOptions,
  stereoCameras: THREE.Camera[] = []
): SimulatorDisplayFov {
  return new SimulatorDisplayFov(camera, stereoCameras, options);
}

function createStereoCameras(camera: THREE.PerspectiveCamera) {
  const leftCamera = camera.clone();
  const rightCamera = camera.clone();
  leftCamera.position.copy(LEFT_EYE_OFFSET);
  rightCamera.position.copy(RIGHT_EYE_OFFSET);
  return [leftCamera, rightCamera] as const;
}

describe('Simulator glasses diagonal FOV', () => {
  it('uses a numeric diagonal FOV and restores the default when unset', () => {
    const camera = new THREE.PerspectiveCamera(
      DEFAULT_TEST_VERTICAL_FOV_DEGREES,
      INITIAL_CAMERA_ASPECT_RATIO
    );
    const options = new SimulatorOptions({
      displayDiagonalFov: SPECTACLES_2027_DIAGONAL_FOV_DEGREES,
    });
    const displayFov = createDisplayFov(camera, options);

    displayFov.apply();
    expect(diagonalFov(camera)).toBeCloseTo(
      SPECTACLES_2027_DIAGONAL_FOV_DEGREES,
      FOV_ASSERTION_PRECISION
    );

    camera.aspect = RESIZED_CAMERA_ASPECT_RATIO;
    displayFov.apply();
    expect(diagonalFov(camera)).toBeCloseTo(
      SPECTACLES_2027_DIAGONAL_FOV_DEGREES,
      FOV_ASSERTION_PRECISION
    );

    options.displayDiagonalFov = AURA_DIAGONAL_FOV_DEGREES;
    displayFov.apply();
    expect(diagonalFov(camera)).toBeCloseTo(
      AURA_DIAGONAL_FOV_DEGREES,
      FOV_ASSERTION_PRECISION
    );

    options.displayDiagonalFov = undefined;
    displayFov.apply();
    expect(camera.fov).toBe(DEFAULT_TEST_VERTICAL_FOV_DEGREES);
  });

  it('rejects an invalid diagonal FOV', () => {
    const camera = new THREE.PerspectiveCamera(
      DEFAULT_TEST_VERTICAL_FOV_DEGREES,
      INITIAL_CAMERA_ASPECT_RATIO
    );
    const options = new SimulatorOptions({
      displayDiagonalFov: MAX_DISPLAY_DIAGONAL_FOV_DEGREES,
    });
    const displayFov = createDisplayFov(camera, options);

    expect(() => displayFov.apply()).toThrow(
      new RegExp(
        `displayDiagonalFov must be greater than ${MIN_DISPLAY_DIAGONAL_FOV_DEGREES}`
      )
    );
  });

  it('syncs both stereo camera projections when FOV or aspect changes', () => {
    const camera = new THREE.PerspectiveCamera(
      DEFAULT_TEST_VERTICAL_FOV_DEGREES,
      INITIAL_CAMERA_ASPECT_RATIO
    );
    const options = new SimulatorOptions({
      displayDiagonalFov: AURA_DIAGONAL_FOV_DEGREES,
      stereo: {enabled: true},
    });
    const stereoCameras: THREE.Camera[] = [];
    const displayFov = createDisplayFov(camera, options, stereoCameras);
    displayFov.apply();
    const [leftCamera, rightCamera] = createStereoCameras(camera);
    stereoCameras.push(leftCamera, rightCamera);
    const initialProjection = leftCamera.projectionMatrix.clone();

    camera.aspect = STEREO_CAMERA_ASPECT_RATIO;
    displayFov.apply();
    for (const eyeCamera of [leftCamera, rightCamera]) {
      expect(eyeCamera).toMatchObject({fov: camera.fov, aspect: camera.aspect});
      expect(eyeCamera.projectionMatrix.equals(camera.projectionMatrix)).toBe(
        true
      );
      expect(eyeCamera.projectionMatrix.equals(initialProjection)).toBe(false);
    }
    expect(leftCamera.position).toEqual(LEFT_EYE_OFFSET);
    expect(rightCamera.position).toEqual(RIGHT_EYE_OFFSET);

    const resizedProjection = leftCamera.projectionMatrix.clone();
    camera.near = UPDATED_CAMERA_NEAR;
    camera.far = UPDATED_CAMERA_FAR;
    camera.zoom = UPDATED_CAMERA_ZOOM;
    camera.updateProjectionMatrix();
    options.displayDiagonalFov = UPDATED_DIAGONAL_FOV_DEGREES;
    displayFov.apply();
    for (const eyeCamera of [leftCamera, rightCamera]) {
      expect(eyeCamera).toMatchObject({
        fov: camera.fov,
        aspect: camera.aspect,
        near: camera.near,
        far: camera.far,
        zoom: camera.zoom,
      });
      expect(eyeCamera.projectionMatrix.equals(camera.projectionMatrix)).toBe(
        true
      );
      expect(
        eyeCamera.projectionMatrixInverse.equals(camera.projectionMatrixInverse)
      ).toBe(true);
      expect(eyeCamera.projectionMatrix.equals(resizedProjection)).toBe(false);
    }
    expect(leftCamera.position).toEqual(LEFT_EYE_OFFSET);
    expect(rightCamera.position).toEqual(RIGHT_EYE_OFFSET);

    options.displayDiagonalFov = undefined;
    displayFov.apply();
    expect(camera.fov).toBe(DEFAULT_TEST_VERTICAL_FOV_DEGREES);
    for (const eyeCamera of [leftCamera, rightCamera]) {
      expect(eyeCamera.projectionMatrix.equals(camera.projectionMatrix)).toBe(
        true
      );
    }
    expect(leftCamera.position).toEqual(LEFT_EYE_OFFSET);
    expect(rightCamera.position).toEqual(RIGHT_EYE_OFFSET);

    options.displayDiagonalFov = AURA_DIAGONAL_FOV_DEGREES;
    displayFov.apply();
    displayFov.dispose();
    expect(camera.fov).toBe(DEFAULT_TEST_VERTICAL_FOV_DEGREES);
    for (const eyeCamera of [leftCamera, rightCamera]) {
      expect(eyeCamera.projectionMatrix.equals(camera.projectionMatrix)).toBe(
        true
      );
    }
    expect(leftCamera.position).toEqual(LEFT_EYE_OFFSET);
    expect(rightCamera.position).toEqual(RIGHT_EYE_OFFSET);
  });

  it('restores the original projection when disposed during startup', () => {
    const camera = new THREE.PerspectiveCamera(
      DEFAULT_TEST_VERTICAL_FOV_DEGREES,
      INITIAL_CAMERA_ASPECT_RATIO
    );
    const originalProjection = camera.projectionMatrix.clone();
    const options = new SimulatorOptions({
      displayDiagonalFov: AURA_DIAGONAL_FOV_DEGREES,
    });
    const displayFov = createDisplayFov(camera, options);
    displayFov.apply();
    expect(camera.projectionMatrix.equals(originalProjection)).toBe(false);

    displayFov.dispose();

    expect(camera.fov).toBe(DEFAULT_TEST_VERTICAL_FOV_DEGREES);
    expect(camera.projectionMatrix.equals(originalProjection)).toBe(true);
  });

  it('preserves app-owned stereo projections and clears restore tracking on dispose', () => {
    const camera = new THREE.PerspectiveCamera(
      DEFAULT_TEST_VERTICAL_FOV_DEGREES,
      INITIAL_CAMERA_ASPECT_RATIO
    );
    const options = new SimulatorOptions({
      displayDiagonalFov: AURA_DIAGONAL_FOV_DEGREES,
      stereo: {enabled: true},
    });
    const stereoCameras: THREE.Camera[] = [];
    const displayFov = createDisplayFov(camera, options, stereoCameras);
    displayFov.apply();
    const [leftCamera, rightCamera] = createStereoCameras(camera);
    stereoCameras.push(leftCamera, rightCamera);
    const appliedFov = camera.fov;

    camera.aspect = APP_CAMERA_ASPECT_RATIO;
    camera.near = APP_CAMERA_NEAR;
    camera.far = APP_CAMERA_FAR;
    camera.zoom = APP_CAMERA_ZOOM;
    camera.updateProjectionMatrix();
    leftCamera.projectionMatrix.copy(camera.projectionMatrix);
    rightCamera.projectionMatrix.copy(camera.projectionMatrix);
    leftCamera.projectionMatrix.elements[PROJECTION_HORIZONTAL_OFFSET_INDEX] =
      -STEREO_PROJECTION_HORIZONTAL_OFFSET;
    rightCamera.projectionMatrix.elements[PROJECTION_HORIZONTAL_OFFSET_INDEX] =
      STEREO_PROJECTION_HORIZONTAL_OFFSET;
    const appProjection = camera.projectionMatrix.clone();
    const leftAppProjection = leftCamera.projectionMatrix.clone();
    const rightAppProjection = rightCamera.projectionMatrix.clone();

    const expectAppProjectionPreserved = () => {
      expect(camera.fov).toBe(appliedFov);
      expect(camera.projectionMatrix.equals(appProjection)).toBe(true);
      expect(leftCamera.projectionMatrix.equals(leftAppProjection)).toBe(true);
      expect(rightCamera.projectionMatrix.equals(rightAppProjection)).toBe(
        true
      );
      expect(leftCamera.position).toEqual(LEFT_EYE_OFFSET);
      expect(rightCamera.position).toEqual(RIGHT_EYE_OFFSET);
    };

    displayFov.dispose();
    expectAppProjectionPreserved();

    displayFov.dispose();
    expectAppProjectionPreserved();
  });
});
