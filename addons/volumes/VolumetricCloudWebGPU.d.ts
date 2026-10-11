import * as THREE from "three";
import { MeshBasicNodeMaterial } from "three/webgpu";
//#region src/addons/volumes/VolumetricCloudWebGPU.d.ts
export interface CloudNodeRig {
  material: MeshBasicNodeMaterial;
  /** Camera position in the cloud mesh's local space (the GLSL `vOrigin`). */
  originUniform: {
    value: THREE.Vector3;
  };
  /** Monotonic frame counter driving the per-fragment jitter. */
  frameUniform: {
    value: number;
  };
}
/**
 * TSL port of the raymarching shader in VolumetricCloud.glsl.ts. Only used on
 * `THREE.WebGPURenderer`, whose backend cannot run `RawShaderMaterial`; the
 * WebGL path keeps the original GLSL verbatim.
 *
 * Differences from the GLSL are limited to pipeline plumbing: the per-fragment
 * jitter uses TSL's `hash` instead of the GLSL wang hash (it is only a dither
 * source), and the linear-to-sRGB output conversion is left to the node
 * pipeline's output transform instead of being applied manually.
 */
export declare function createCloudNodeMaterial(base: THREE.Color, texture: THREE.Data3DTexture): CloudNodeRig;
//#endregion