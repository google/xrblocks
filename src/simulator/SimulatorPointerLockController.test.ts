import * as THREE from 'three';
import {describe, it, expect} from 'vitest';

import {SimulatorPointerLockController} from './SimulatorPointerLockController';

describe('SimulatorPointerLockController', () => {
  it('copies the connected camera pose', () => {
    const controller = new SimulatorPointerLockController();
    const camera = new THREE.Camera();
    camera.position.set(1, 2, 3);
    camera.quaternion.set(0.1, 0.2, 0.3, 0.4).normalize();

    controller.init({camera});
    controller.userData.connected = true;
    controller.update();
    expect(controller.position.toArray()).toEqual([1, 2, 3]);
    expect(controller.quaternion.x).toBeCloseTo(camera.quaternion.x, 5);
    expect(controller.quaternion.y).toBeCloseTo(camera.quaternion.y, 5);
    expect(controller.quaternion.z).toBeCloseTo(camera.quaternion.z, 5);
    expect(controller.quaternion.w).toBeCloseTo(camera.quaternion.w, 5);
  });
});
