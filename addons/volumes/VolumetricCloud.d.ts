import { CloudNodeRig } from "./VolumetricCloudWebGPU.js";
import * as THREE from "three";
import { WebGLOrWebGPURenderer } from "xrblocks";
//#region src/addons/volumes/VolumetricCloud.d.ts
/**
 * VolumetricCloud class for creating a 3D volumetric cloud effect in a scene.
 */
export declare class VolumetricCloud extends THREE.Object3D {
  private size;
  private cloudScale;
  private texture;
  private vertexShader;
  private fragmentShader;
  private material;
  private geometry;
  private readonly worldToLocal;
  /** TSL shader rig when running on WebGPURenderer; set once it finishes loading. */
  nodeRig?: CloudNodeRig;
  mesh: THREE.Mesh<THREE.BoxGeometry, THREE.Material>;
  /**
   * Constructor for the VolumetricCloud class.
   *
   * @param renderer - The active renderer, when known. On `THREE.WebGPURenderer`
   *   the GLSL raymarch cannot run (`RawShaderMaterial` is unsupported by that
   *   backend), so a TSL port of the same shader is swapped in asynchronously;
   *   the mesh stays invisible until it loads. Without a renderer the original
   *   GLSL material is used.
   */
  constructor(renderer?: WebGLOrWebGPURenderer);
  /**
   * Creates and populates a 3D texture with Perlin noise.
   * @returns A 3D texture containing the noise data.
   */
  private createTexture;
  /**
   * Creates the custom material for rendering the volumetric cloud.
   * @returns The material for the cloud mesh.
   */
  private createMaterial;
  /**
   * Updates the cloud's position and rotation to sync with the camera's
   * position and to animate the cloud's rotation.
   */
  update(camera: THREE.Camera): void;
}
//#endregion