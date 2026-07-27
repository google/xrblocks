import * as THREE from 'three';
import type {GLTF} from 'three/addons/loaders/GLTFLoader.js';

import {ResolvedSimulatorSceneManifest} from './SimulatorEnvironmentManifest';

export class SimulatorScene extends THREE.Scene {
  gltf?: GLTF;
  environmentRoot?: THREE.Group;

  constructor() {
    super();
    this.add(new THREE.HemisphereLight(0xbbbbbb, 0x888888, 3));
  }

  createEnvironmentRoot(manifest: ResolvedSimulatorSceneManifest) {
    const root = new THREE.Group();
    root.name = 'Simulator Environment';
    if (manifest.position) root.position.fromArray(manifest.position);
    if (manifest.quaternion) root.quaternion.fromArray(manifest.quaternion);
    if (manifest.scale) root.scale.fromArray(manifest.scale);
    const objects = new THREE.Group();
    objects.name = 'Simulator Objects';
    root.add(objects);
    return {root, objects};
  }

  commitEnvironment(root: THREE.Group, gltf?: GLTF) {
    const previousRoot = this.environmentRoot;
    this.add(root);
    this.environmentRoot = root;
    this.gltf = gltf;
    previousRoot?.removeFromParent();
    return previousRoot;
  }

  clearEnvironment() {
    this.environmentRoot?.removeFromParent();
    this.environmentRoot = undefined;
    this.gltf = undefined;
  }
}
