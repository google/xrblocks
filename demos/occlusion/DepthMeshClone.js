import * as THREE from 'three';
import {xrDepthMeshOptions} from 'xrblocks';

export class DepthMeshClone extends THREE.Mesh {
  constructor() {
    super(new THREE.PlaneGeometry(), new THREE.ShadowMaterial({
      opacity: xrDepthMeshOptions.depthMesh.shadowOpacity,
      depthWrite: false
    }));
    this.receiveShadow = true;
  }

  cloneDepthMesh(depthMesh) {
    this.geometry.dispose();
    this.geometry = depthMesh.geometry.clone();
    depthMesh.getWorldPosition(this.position);
    depthMesh.getWorldQuaternion(this.quaternion);
    depthMesh.getWorldScale(this.scale);
  }
}