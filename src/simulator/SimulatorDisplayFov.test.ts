import * as THREE from 'three';
import {describe, expect, it} from 'vitest';
import {SimulatorDisplayFov} from './SimulatorDisplayFov';
import {SimulatorOptions} from './SimulatorOptions';

function diagonalFov(camera: THREE.PerspectiveCamera) {
  const tangent = Math.tan(THREE.MathUtils.degToRad(camera.fov / 2));
  return THREE.MathUtils.radToDeg(
    2 * Math.atan(Math.hypot(camera.aspect * tangent, tangent))
  );
}

describe('SimulatorDisplayFov', () => {
  it('maintains the requested diagonal field on resize and restores each app FOV', () => {
    const camera = new THREE.PerspectiveCamera(63, 1.7);
    const options = new SimulatorOptions({displayDiagonalFov: 77});
    const display = new SimulatorDisplayFov(camera, [], options);
    display.apply();
    expect(diagonalFov(camera)).toBeCloseTo(77);
    camera.aspect = 0.8;
    display.apply();
    expect(diagonalFov(camera)).toBeCloseTo(77);
    options.displayDiagonalFov = undefined;
    display.apply();
    expect(camera.fov).toBe(63);
    camera.fov = 55;
    camera.updateProjectionMatrix();
    const appProjection = camera.projectionMatrix.clone();
    options.displayDiagonalFov = 84;
    display.apply();
    expect(diagonalFov(camera)).toBeCloseTo(84);
    display.dispose();
    expect(camera.projectionMatrix).toEqual(appProjection);
  });

  it('updates stereo projections without moving the eyes', () => {
    const camera = new THREE.PerspectiveCamera(57, 1.4);
    const eyes = [camera.clone(), camera.clone()];
    eyes[0].position.x = -0.03;
    eyes[1].position.x = 0.03;
    const positions = eyes.map((eye) => eye.position.clone());
    const options = new SimulatorOptions({
      displayDiagonalFov: 73,
      stereo: {enabled: true},
    });
    const display = new SimulatorDisplayFov(camera, eyes, options);
    display.apply();
    camera.aspect = 1.2;
    camera.near = 0.15;
    camera.far = 750;
    camera.zoom = 1.25;
    camera.updateProjectionMatrix();
    display.apply();
    for (const eye of eyes) {
      expect(eye.projectionMatrix).toEqual(camera.projectionMatrix);
      expect(eye.projectionMatrixInverse).toEqual(
        camera.projectionMatrixInverse
      );
    }
    display.dispose();
    expect(camera.fov).toBe(57);
    for (const [index, eye] of eyes.entries()) {
      expect(eye.projectionMatrix).toEqual(camera.projectionMatrix);
      expect(eye.position).toEqual(positions[index]);
    }
  });

  it('preserves app-owned projection changes made while the preset is active', () => {
    const camera = new THREE.PerspectiveCamera(62, 1.5);
    const eyes = [camera.clone(), camera.clone()];
    const display = new SimulatorDisplayFov(
      camera,
      eyes,
      new SimulatorOptions({displayDiagonalFov: 79, stereo: {enabled: true}})
    );
    display.apply();
    camera.fov = 48;
    camera.updateProjectionMatrix();
    eyes[0].projectionMatrix.elements[8] = -0.02;
    eyes[1].projectionMatrix.elements[8] = 0.02;
    const projections = [camera, ...eyes].map((view) =>
      view.projectionMatrix.clone()
    );
    display.dispose();
    expect([camera, ...eyes].map((view) => view.projectionMatrix)).toEqual(
      projections
    );
  });
});
