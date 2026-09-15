import * as THREE from 'three';
import {FullScreenQuad} from 'three/addons/postprocessing/Pass.js';
import * as xb from 'xrblocks';

import {DepthMapShader} from './depthmap.glsl.js';

/**
 * Depth map visualization postprocess pass.
 */
export class DepthVisualizationPass extends xb.XRPass {
  constructor() {
    super();
    this.depthTextures = [null, null];
    this.uniforms = {
      uDepthTexture: {value: null},
      uDepthTextureArray: {value: null},
      uRawValueToMeters: {value: 8.0 / 65536.0},
      uAlpha: {value: 1.0},
      tDiffuse: {value: null},
      uView: {value: 0},
      uIsTextureArray: {value: 0},
      // Used to interpret Quest 3 depth.
      uDepthNear: {value: 0},
      uUsingFloatDepth: {
        value: xb.core.options.depth.dataFormatPreference[0] === 'float32',
      },
      uNormDepthBufferFromNormView: {value: new THREE.Matrix4()},
    };
    this.depthMapQuad = new FullScreenQuad(
      new THREE.ShaderMaterial({
        name: 'DepthMapShader',
        uniforms: this.uniforms,
        vertexShader: DepthMapShader.vertexShader,
        fragmentShader: DepthMapShader.fragmentShader,
      })
    );
  }

  setAlpha(value) {
    this.uniforms.uAlpha.value = value;
  }

  updateEnvironmentalDepthTexture(xrDepth) {
    this.depthTextures[0] = xrDepth.getTexture(0);
    this.depthTextures[1] = xrDepth.getTexture(1);
    this.uniforms.uRawValueToMeters.value = xrDepth.rawValueToMeters;
    if (this.depthTextures[0]) {
      this.uniforms.uIsTextureArray.value = this.depthTextures[0]
        .isExternalTexture
        ? 1.0
        : 0;
      this.uniforms.uUsingFloatDepth.value =
        this.depthTextures[0].type === THREE.FloatType;
    }
  }

  render(renderer, writeBuffer, readBuffer, deltaTime, maskActive, viewId) {
    const texture = this.depthTextures[viewId];
    if (!texture) return;
    if (texture.isExternalTexture) {
      this.uniforms.uDepthTextureArray.value = texture;
      const depthNear = xb.core.depth.gpuDepthData[0].depthNear;
      this.uniforms.uDepthNear.value = depthNear;
    } else {
      this.uniforms.uDepthTexture.value = texture;
    }
    if (xb.core.depth.normDepthBufferFromNormViewMatrices.length > viewId) {
      this.uniforms.uNormDepthBufferFromNormView.value.copy(
        xb.core.depth.normDepthBufferFromNormViewMatrices[viewId]
      );
    }
    this.uniforms.tDiffuse.value = readBuffer.texture;
    this.uniforms.uView.value = viewId;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.depthMapQuad.render(renderer);
  }

  dispose() {
    this.depthMapQuad.dispose();
  }
}
