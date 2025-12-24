import * as THREE from 'three';

import {DepthOptions} from './DepthOptions';

export class DepthTextures {
  private float32Arrays: Float32Array[] = [];
  private uint8Arrays: Uint8Array[] = [];
  private dataTextures: THREE.DataTexture[] = [];
  private nativeTextures: THREE.ExternalTexture[] = [];
  public depthData: XRCPUDepthInformation[] = [];

  constructor(private options: DepthOptions) {}

  private createDataDepthTextures(
    depthData: XRCPUDepthInformation,
    view_id: number
  ) {
    if (this.dataTextures[view_id]) {
      this.dataTextures[view_id].dispose();
    }
    if (this.options.useFloat32) {
      const typedArray = new Float32Array(depthData.width * depthData.height);
      const format = THREE.RedFormat;
      const type = THREE.FloatType;
      this.float32Arrays[view_id] = typedArray;
      this.dataTextures[view_id] = new THREE.DataTexture(
        typedArray,
        depthData.width,
        depthData.height,
        format,
        type
      );
    } else {
      const typedArray = new Uint8Array(depthData.width * depthData.height * 2);
      const format = THREE.RGFormat;
      const type = THREE.UnsignedByteType;
      this.uint8Arrays[view_id] = typedArray;
      this.dataTextures[view_id] = new THREE.DataTexture(
        typedArray,
        depthData.width,
        depthData.height,
        format,
        type
      );
    }
  }

  updateData(depthData: XRCPUDepthInformation, view_id: number) {
    if (
      this.dataTextures.length < view_id + 1 ||
      this.dataTextures[view_id].image.width !== depthData.width ||
      this.dataTextures[view_id].image.height !== depthData.height
    ) {
      this.createDataDepthTextures(depthData, view_id);
    }
    if (this.options.useFloat32) {
      this.float32Arrays[view_id].set(new Float32Array(depthData.data));
    } else {
      this.uint8Arrays[view_id].set(new Uint8Array(depthData.data));
    }
    this.dataTextures[view_id].needsUpdate = true;
    this.depthData[view_id] = depthData;
  }

  updateNativeTexture(
    depthData: XRWebGLDepthInformation,
    renderer: THREE.WebGLRenderer,
    view_id: number
  ) {
    if (this.dataTextures.length < view_id + 1) {
      this.nativeTextures[view_id] = new THREE.ExternalTexture(
        depthData.texture
      );
    } else {
      this.nativeTextures[view_id].sourceTexture = depthData.texture;
    }
    // fixed in newer revision of three
    const textureProperties = renderer.properties.get(
      this.nativeTextures[view_id]
    ) as {
      __webglTexture: WebGLTexture;
      __version: number;
    };
    textureProperties.__webglTexture = depthData.texture;
    textureProperties.__version = 1;
  }

  get(view_id: number) {
    if (this.dataTextures.length > 0) {
      return this.dataTextures[view_id];
    }

    return this.nativeTextures[view_id];
  }
}
