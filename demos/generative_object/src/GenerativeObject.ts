import * as THREE from 'three';
import {
  computeBillboardScale,
  DragMode,
  type Draggable,
  type HasDraggingMode,
  OCCLUDABLE_ITEMS_LAYER,
  Script,
} from 'xrblocks';

import type {LoadedTexture} from './TextureSource.js';

/** How to build a {@link GenerativeObject}'s mesh. */
export interface GenerativeObjectStyle {
  /** Largest dimension of the object, in meters. */
  maxSize: number;
  /** Build a displaced 2.5D relief instead of a flat cutout. */
  relief?: boolean;
  /** Relief displacement depth in meters. */
  reliefStrength?: number;
  /** Plane subdivisions per side used for the relief mesh. */
  reliefSegments?: number;
}

/**
 * A generated image placed in the scene as a draggable object: a flat textured
 * cutout by default, or a displaced relief mesh when
 * {@link GenerativeObjectStyle.relief} is set. Opts into
 * `OCCLUDABLE_ITEMS_LAYER` so depth occlusion can hide it behind real geometry.
 */
export class GenerativeObject
  extends Script
  implements Draggable, HasDraggingMode
{
  draggable = true;
  // Lets the global DragManager pick the object up and move it; without a
  // draggingMode the manager bails out of beginDragging.
  draggingMode = DragMode.TRANSLATING;

  /** The prompt that produced this object. */
  readonly prompt: string;

  /** The mesh that renders the generated image. */
  readonly mesh: THREE.Mesh<THREE.PlaneGeometry, THREE.Material>;

  /**
   * @param prompt - The prompt that produced the image.
   * @param loaded - The decoded texture and its pixel dimensions.
   * @param style - How to size and build the mesh.
   */
  constructor(
    prompt: string,
    loaded: LoadedTexture,
    style: GenerativeObjectStyle
  ) {
    super();
    this.prompt = prompt;

    this.mesh = style.relief
      ? buildReliefMesh(loaded, style)
      : buildFlatMesh(loaded.texture);

    const size = computeBillboardScale(
      loaded.width,
      loaded.height,
      style.maxSize
    );
    this.mesh.scale.set(size.x, size.y, 1);
    this.add(this.mesh);

    // Allow real-world depth to occlude the generated object.
    this.mesh.layers.enable(OCCLUDABLE_ITEMS_LAYER);
  }

  /** Releases GPU resources held by this object. */
  dispose() {
    this.mesh.geometry.dispose();
    const material = this.mesh.material as THREE.Material & {
      map?: THREE.Texture | null;
      displacementMap?: THREE.Texture | null;
      bumpMap?: THREE.Texture | null;
    };
    // Dispose every distinct texture the material references (the relief mesh
    // reuses one map across displacement + bump, so guard against double free).
    const textures = new Set<THREE.Texture>();
    for (const tex of [
      material.map,
      material.displacementMap,
      material.bumpMap,
    ]) {
      if (tex) textures.add(tex);
    }
    for (const tex of textures) tex.dispose();
    material.dispose();
  }
}

function buildFlatMesh(texture: THREE.Texture) {
  const material = new THREE.MeshBasicMaterial({
    map: texture,
    transparent: true,
    // Discard the keyed-out (transparent) pixels so edge filtering doesn't blend
    // the chroma-key background color into a halo around the cutout.
    alphaTest: 0.5,
    side: THREE.DoubleSide,
  });
  return new THREE.Mesh(new THREE.PlaneGeometry(1, 1), material);
}

function buildReliefMesh(loaded: LoadedTexture, style: GenerativeObjectStyle) {
  const segments = style.reliefSegments ?? 96;
  const strength = style.reliefStrength ?? 0.04;
  // Displace/bump from an alpha-masked grayscale map (background stays flat) so
  // brighter subject regions stand out and pick up shading. Falls back to the
  // color texture when no masked map is available.
  const displacementMap = loaded.displacementTexture ?? loaded.texture;
  const material = new THREE.MeshStandardMaterial({
    map: loaded.texture,
    displacementMap,
    displacementScale: strength,
    bumpMap: displacementMap,
    roughness: 0.9,
    metalness: 0,
    transparent: true,
    alphaTest: 0.5,
    side: THREE.DoubleSide,
  });
  return new THREE.Mesh(
    new THREE.PlaneGeometry(1, 1, segments, segments),
    material
  );
}
