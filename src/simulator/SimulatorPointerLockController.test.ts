import * as THREE from 'three';
import {describe, it, expect} from 'vitest';

import {SimulatorPointerLockController} from './SimulatorPointerLockController';

describe('SimulatorPointerLockController', () => {
  it('initializes with a camera dependency', () => {
    const controller = new SimulatorPointerLockController();
    const camera = new THREE.Camera();

    controller.init({camera});
    expect(controller.camera).toBe(camera);
  });

  it('updates position and orientation to match the camera when connected', () => {
    const controller = new SimulatorPointerLockController();
    const camera = new THREE.Camera();
    camera.position.set(1, 2, 3);
    camera.quaternion.set(0.1, 0.2, 0.3, 0.4).normalize();

    controller.init({camera});

    // Not updated if disconnected
    controller.userData.connected = false;
    controller.update();
    expect(controller.position.x).toBe(0);
    expect(controller.quaternion.x).toBe(0);

    // Updated if connected
    controller.userData.connected = true;
    controller.update();
    expect(controller.position.x).toBe(1);
    expect(controller.position.y).toBe(2);
    expect(controller.position.z).toBe(3);
    expect(controller.quaternion.x).toBeCloseTo(camera.quaternion.x, 5);
    expect(controller.quaternion.y).toBeCloseTo(camera.quaternion.y, 5);
    expect(controller.quaternion.z).toBeCloseTo(camera.quaternion.z, 5);
    expect(controller.quaternion.w).toBeCloseTo(camera.quaternion.w, 5);
  });

  it('dispatches connect and disconnect events', () => {
    const controller = new SimulatorPointerLockController();
    let connectedTarget: SimulatorPointerLockController | null = null;
    let disconnectedTarget: SimulatorPointerLockController | null = null;

    controller.addEventListener('connected', (e) => {
      connectedTarget = e.target;
    });
    controller.addEventListener('disconnected', (e) => {
      disconnectedTarget = e.target;
    });

    controller.connect();
    expect(connectedTarget).toBe(controller);

    controller.disconnect();
    expect(disconnectedTarget).toBe(controller);
  });

  it('dispatches selectstart and selectend events', () => {
    const controller = new SimulatorPointerLockController();
    let selectStartTarget: SimulatorPointerLockController | null = null;
    let selectEndTarget: SimulatorPointerLockController | null = null;

    controller.addEventListener('selectstart', (e) => {
      selectStartTarget = e.target;
    });
    controller.addEventListener('selectend', (e) => {
      selectEndTarget = e.target;
    });

    controller.callSelectStart();
    expect(selectStartTarget).toBe(controller);

    controller.callSelectEnd();
    expect(selectEndTarget).toBe(controller);
  });

  it('updates pose to match camera directly when updatePose is called', () => {
    const controller = new SimulatorPointerLockController();
    const camera = new THREE.Camera();
    camera.position.set(4, 5, 6);
    camera.quaternion.set(0.4, 0.3, 0.2, 0.1).normalize();

    controller.init({camera});
    controller.updatePose();

    expect(controller.position.x).toBe(4);
    expect(controller.position.y).toBe(5);
    expect(controller.position.z).toBe(6);
    expect(controller.quaternion.x).toBeCloseTo(camera.quaternion.x, 5);
  });
});
