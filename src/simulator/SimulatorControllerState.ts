import * as THREE from 'three';

export class SimulatorControllerState {
  localControllerPositions =
      [new THREE.Vector3(-0.3, -0.1, -0.3), new THREE.Vector3(0.3, -0.1, -0.3)];
  localControllerOrientations =
      [new THREE.Quaternion(), new THREE.Quaternion()];

  currentControllerIndex = 0;
}