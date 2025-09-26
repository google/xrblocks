import * as THREE from 'three';

import {DepthOptions} from './DepthOptions';

export class DepthTextures {
  private uint16Arrays: Uint16Array[] = [];
  private uint8Arrays: Uint8Array[] = [];
  private textures: THREE.DataTexture[] = [];
  public depthData: XRCPUDepthInformation[] = [];

  constructor(private options: DepthOptions) {}

  private createDepthTextures(
      depthData: XRCPUDepthInformation, view_id: number) {
    if (this.textures[view_id]) {
      this.textures[view_id].dispose();
    }
    if (this.options.useFloat32) {
      const typedArray = new Uint16Array(depthData.width * depthData.height);
      const format = THREE.RedFormat;
      const type = THREE.HalfFloatType;
      this.uint16Arrays[view_id] = typedArray;
      this.textures[view_id] = new THREE.DataTexture(
          typedArray, depthData.width, depthData.height, format, type);
    } else {
      const typedArray = new Uint8Array(depthData.width * depthData.height * 2);
      const format = THREE.RGFormat;
      const type = THREE.UnsignedByteType;
      this.uint8Arrays[view_id] = typedArray;
      this.textures[view_id] = new THREE.DataTexture(
          typedArray, depthData.width, depthData.height, format, type);
    }
  }

  update(depthData: XRCPUDepthInformation, view_id: number) {
    if (this.textures.length < view_id + 1 ||
        this.textures[view_id].image.width !== depthData.width ||
        this.textures[view_id].image.height !== depthData.height) {
      this.createDepthTextures(depthData, view_id);
    }
    if (this.options.useFloat32) {
      const float32Data = new Float32Array(depthData.data);
      const float16Data = new Uint16Array(float32Data.length);
      for (let i = 0; i < float16Data.length; i++) {
        float16Data[i] = THREE.DataUtils.toHalfFloat(float32Data[i]);
      }
      this.uint16Arrays[view_id].set(float16Data);
    } else {
      this.uint8Arrays[view_id].set(new Uint8Array(depthData.data));
    }
    this.textures[view_id].needsUpdate = true;
    this.depthData[view_id] = depthData;
  }

  get(view_id: number) {
    return this.textures[view_id];
  }
};
