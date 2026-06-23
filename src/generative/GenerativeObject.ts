import * as THREE from 'three';

import {OCCLUDABLE_ITEMS_LAYER} from '../constants';
import {Script} from '../core/Script';
import type {Draggable} from '../ux/DragManager';

import {computeBillboardScale} from './GenerativeObjectUtils';
import type {LoadedTexture} from './TextureSource';

/**
 * A generated image placed in the scene as a flat, draggable billboard.
 *
 * The object is a single textured plane sized to preserve the source image's
 * aspect ratio. It is {@link Draggable} (so the global `DragManager` lets the
 * user grab and move it) and opts into {@link OCCLUDABLE_ITEMS_LAYER} so real
 * world geometry can occlude it when depth occlusion is enabled.
 */
export class GenerativeObject extends Script implements Draggable {
  draggable = true;

  /** The prompt that produced this object. */
  readonly prompt: string;

  /** The textured plane that renders the generated image. */
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.MeshBasicMaterial>;

  /**
   * @param prompt - The prompt that produced the image.
   * @param loaded - The decoded texture and its pixel dimensions.
   * @param maxSize - Largest dimension of the billboard, in meters.
   */
  constructor(prompt: string, loaded: LoadedTexture, maxSize: number) {
    super();
    this.prompt = prompt;

    const material = new THREE.MeshBasicMaterial({
      map: loaded.texture,
      transparent: true,
      side: THREE.DoubleSide,
    });
    this.mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);

    const size = computeBillboardScale(loaded.width, loaded.height, maxSize);
    this.mesh.scale.set(size.x, size.y, 1);
    this.add(this.mesh);

    // Allow real-world depth to occlude the generated object.
    this.mesh.layers.enable(OCCLUDABLE_ITEMS_LAYER);
  }

  /** Releases GPU resources held by this object. */
  dispose() {
    this.mesh.geometry.dispose();
    this.mesh.material.map?.dispose();
    this.mesh.material.dispose();
  }
}
