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
    viewId: number,
    depthDataFormat: XRDepthDataFormat
  ) {
    if (this.dataTextures[viewId]) {
      this.dataTextures[viewId].dispose();
    }
    if (depthDataFormat === 'float32') {
      const typedArray = new Float32Array(depthData.width * depthData.height);
      const format = THREE.RedFormat;
      const type = THREE.FloatType;
      this.float32Arrays[viewId] = typedArray;
      this.dataTextures[viewId] = new THREE.DataTexture(
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
      this.uint8Arrays[viewId] = typedArray;
      this.dataTextures[viewId] = new THREE.DataTexture(
        typedArray,
        depthData.width,
        depthData.height,
        format,
        type
      );
    }
  }

  updateData(
    depthData: XRCPUDepthInformation,
    viewId: number,
    depthDataFormat: XRDepthDataFormat
  ) {
    if (
      this.dataTextures.length < viewId + 1 ||
      this.dataTextures[viewId].image.width !== depthData.width ||
      this.dataTextures[viewId].image.height !== depthData.height
    ) {
      this.createDataDepthTextures(depthData, viewId, depthDataFormat);
    }
    if (depthDataFormat === 'float32') {
      this.float32Arrays[viewId].set(new Float32Array(depthData.data));
    } else {
      this.uint8Arrays[viewId].set(new Uint8Array(depthData.data));
    }
    this.dataTextures[viewId].needsUpdate = true;
    this.depthData[viewId] = depthData;
  }

  updateNativeTexture(
    depthData: XRWebGLDepthInformation,
    renderer: THREE.WebGLRenderer,
    viewId: number
  ) {
    if (this.nativeTextures.length < viewId + 1) {
      this.nativeTextures[viewId] = new THREE.ExternalTexture(
        depthData.texture
      );
    } else {
      this.nativeTextures[viewId].sourceTexture = depthData.texture;
    }
    // fixed in newer revision of three
    const textureProperties = renderer.properties.get(
      this.nativeTextures[viewId]
    ) as {
      __webglTexture: WebGLTexture;
      __version: number;
    };
    textureProperties.__webglTexture = depthData.texture;
    textureProperties.__version = 1;
  }

  get(viewId: number) {
    if (this.dataTextures.length > 0) {
      return this.dataTextures[viewId];
    }

    return this.nativeTextures[viewId];
  }
}
