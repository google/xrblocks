import * as THREE from 'three';

export class ControllerRayVisual extends THREE.Line {
  constructor() {
    const geometry = new THREE.BufferGeometry().setFromPoints(
        [new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1)]);

    super(geometry);
    this.scale.z = 5;
  }

  // Ignore raycasts to this line.
  raycast() {}
}
