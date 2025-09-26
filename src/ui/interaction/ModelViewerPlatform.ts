import * as THREE from 'three';

import {DragManager} from '../../ux/DragManager.js';

import {AnimatableNumber} from './AnimatableNumber.js';
import {createPlatformGeometry} from './ModelViewerPlatformGeometry.js';

/**
 * A specialized `THREE.Mesh` that serves as the interactive base for
 * a `ModelViewer`. It has a distinct visual appearance and handles the logic
 * for fading in and out on hover. Its `draggingMode` is set to `TRANSLATING` to
 * enable movement.
 */
export class ModelViewerPlatform extends
    THREE.Mesh<THREE.BufferGeometry, THREE.Material[]> {
  draggingMode = DragManager.TRANSLATING;
  opacity: AnimatableNumber;

  constructor(width: number, depth: number, thickness: number) {
    const geometry = createPlatformGeometry(width, depth, thickness);
    super(geometry, [
      new THREE.MeshLambertMaterial(
          {color: 0xFFFFFF, transparent: true, opacity: 0.0}),
      new THREE.MeshLambertMaterial(
          {color: 0xFFFFFF, transparent: true, opacity: 0.0})
    ]);
    this.opacity = new AnimatableNumber(0, 0, 0.5, 0);
  }

  update(deltaTime: number) {
    this.opacity.update(deltaTime);
    this.material[0].opacity = this.opacity.value;
    this.material[1].opacity = 0.5 * this.opacity.value;
    this.visible = this.opacity.value > 0.001;
  }
}
