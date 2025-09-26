import * as THREE from 'three';
import {FullScreenQuad,} from 'three/addons/postprocessing/Pass.js';
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
      uRawValueToMeters: {value: 8.0 / 65536.0},
      uAlpha: {value: 1.0},
      tDiffuse: {value: null},
    };
    this.depthMapQuad = new FullScreenQuad(new THREE.ShaderMaterial({
      name: 'DepthMapShader',
      uniforms: this.uniforms,
      vertexShader: DepthMapShader.vertexShader,
      fragmentShader: DepthMapShader.fragmentShader,
    }));
  }

  setAlpha(value) {
    this.uniforms.uAlpha.value = value;
  }

  updateEnvironmentalDepthTexture(xrDepth) {
    this.depthTextures[0] = xrDepth.getTexture(0);
    this.depthTextures[1] = xrDepth.getTexture(1);
    this.uniforms.uRawValueToMeters.value = xrDepth.rawValueToMeters;
  }

  render(renderer, writeBuffer, readBuffer, deltaTime, maskActive, viewId) {
    // Fuse the rendered image and the occlusion map.
    this.uniforms.uDepthTexture.value = this.depthTextures[viewId];
    this.uniforms.tDiffuse.value = readBuffer.texture;
    renderer.setRenderTarget(this.renderToScreen ? null : writeBuffer);
    this.depthMapQuad.render(renderer);
  }

  dispose() {
    this.depthMapQuad.dispose();
  }
}
