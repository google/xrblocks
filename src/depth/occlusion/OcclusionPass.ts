import * as THREE from 'three';
import {FullScreenQuad, Pass} from 'three/addons/postprocessing/Pass.js';

import {OCCLUDABLE_ITEMS_LAYER} from '../../constants';
import type {ShaderUniforms} from '../../utils/Types';

import {KawaseBlurShader} from './kawaseblur.glsl';
import {OcclusionShader} from './occlusion.glsl';
import {OcclusionMapShader} from './occlusion_map.glsl';
import {OcclusionMapMeshMaterial} from './OcclusionMapMeshMaterial';

enum KawaseBlurMode {
  COPY = 0,
  DOWN = 1,
  UP = 2
}

/**
 * Occlusion postprocessing shader pass.
 * This is used to generate an occlusion map.
 * There are two modes:
 * Mode A: Generate an occlusion map for individual materials to use.
 * Mode B: Given a rendered frame, run as a postprocessing pass, occluding all
 * items in the frame. The steps are
 * 1. Compute an occlusion map between the real and virtual depth.
 * 2. Blur the occlusion map using Kawase blur.
 * 3. (Mode B only) Apply the occlusion map to the rendered frame.
 */
export class OcclusionPass extends Pass {
  private depthTextures: THREE.Texture[] = [];
  private occlusionMeshMaterial: OcclusionMapMeshMaterial;
  private occlusionMapUniforms: ShaderUniforms;
  private occlusionMapQuad: FullScreenQuad;
  private occlusionMapTexture: THREE.WebGLRenderTarget;
  private kawaseBlurQuads: FullScreenQuad[];
  private kawaseBlurTargets: THREE.WebGLRenderTarget[];
  private occlusionUniforms: ShaderUniforms;
  private occlusionQuad: FullScreenQuad;

  constructor(
      private scene: THREE.Scene, private camera: THREE.PerspectiveCamera,
      useFloatDepth = true, public renderToScreen = false,
      private occludableItemsLayer = OCCLUDABLE_ITEMS_LAYER) {
    super();

    this.occlusionMeshMaterial =
        new OcclusionMapMeshMaterial(camera, useFloatDepth);

    this.occlusionMapUniforms = {
      uDepthTexture: {value: null},
      uUvTransform: {value: new THREE.Matrix4()},
      uRawValueToMeters: {value: 8.0 / 65536.0},
      uAlpha: {value: 0.75},
      tDiffuse: {value: null},
      tDepth: {value: null},
      uFloatDepth: {value: useFloatDepth},
      cameraFar: {value: camera.far},
      cameraNear: {value: camera.near},
    };
    this.occlusionMapQuad = new FullScreenQuad(new THREE.ShaderMaterial({
      name: 'OcclusionMapShader',
      uniforms: this.occlusionMapUniforms,
      vertexShader: OcclusionMapShader.vertexShader,
      fragmentShader: OcclusionMapShader.fragmentShader,
    }));
    this.occlusionMapTexture = new THREE.WebGLRenderTarget();

    this.kawaseBlurTargets = [
      new THREE.WebGLRenderTarget(),  // 1/2 resolution
      new THREE.WebGLRenderTarget(),  // 1/4 resolution
      new THREE.WebGLRenderTarget(),  // 1/8 resolution
    ];
    this.kawaseBlurQuads = [
      this.setupKawaseBlur(
          KawaseBlurMode.DOWN, this.occlusionMapTexture.texture),
      this.setupKawaseBlur(
          KawaseBlurMode.DOWN, this.kawaseBlurTargets[0].texture),
      this.setupKawaseBlur(
          KawaseBlurMode.DOWN, this.kawaseBlurTargets[1].texture),
      this.setupKawaseBlur(
          KawaseBlurMode.UP, this.kawaseBlurTargets[2].texture),
      this.setupKawaseBlur(
          KawaseBlurMode.UP, this.kawaseBlurTargets[1].texture),
      this.setupKawaseBlur(
          KawaseBlurMode.UP, this.kawaseBlurTargets[0].texture),
    ];

    this.occlusionUniforms = {
      tDiffuse: {value: null},
      tOcclusionMap: {value: this.occlusionMapTexture.texture},
    };
    this.occlusionQuad = new FullScreenQuad(new THREE.ShaderMaterial({
      name: 'OcclusionShader',
      uniforms: this.occlusionUniforms,
      vertexShader: OcclusionShader.vertexShader,
      fragmentShader: OcclusionShader.fragmentShader,
    }));

    this.occludableItemsLayer = occludableItemsLayer;
  }

  private setupKawaseBlur(mode: KawaseBlurMode, inputTexture: THREE.Texture) {
    const uniforms = {
      uBlurSize: {value: 7.0},
      uTexelSize: {value: new THREE.Vector2()},
      tDiffuse: {value: inputTexture}
    };
    const kawase1Material = new THREE.ShaderMaterial({
      name: 'Kawase',
      uniforms: uniforms,
      vertexShader: KawaseBlurShader.vertexShader,
      fragmentShader: KawaseBlurShader.fragmentShader,
      defines: {MODE: mode}
    });
    return new FullScreenQuad(kawase1Material);
  }

  setDepthTexture(
      depthTexture: THREE.Texture, rawValueToMeters: number, view_id: number) {
    if (view_id > 1) {
      return;
    }
    this.depthTextures[view_id] = depthTexture;
    this.occlusionMapUniforms.uRawValueToMeters.value = rawValueToMeters;
    this.occlusionMeshMaterial.uniforms.uRawValueToMeters.value =
        rawValueToMeters;
    depthTexture.needsUpdate = true;
  }

  /**
   * Render the occlusion map.
   * @param renderer - The three.js renderer.
   * @param writeBuffer - The buffer to write the final result.
   * @param readBuffer - The buffer for the current of virtual depth.
   * @param view_id - The view to render.
   */
  render(
      renderer: THREE.WebGLRenderer, writeBuffer?: THREE.WebGLRenderTarget,
      readBuffer?: THREE.WebGLRenderTarget, view_id = 0) {
    const originalRenderTarget = renderer.getRenderTarget();
    const dimensions = new THREE.Vector2();
    if (readBuffer == null) {
      this.renderOcclusionMapFromScene(renderer, dimensions, view_id);
    } else {
      this.renderOcclusionMapFromReadBuffer(
          renderer, readBuffer, dimensions, view_id);
    }

    // Blur the occlusion map
    this.blurOcclusionMap(renderer, dimensions);

    // Fuse the rendered image and the occlusion map.
    this.applyOcclusionMapToRenderedImage(renderer, readBuffer, writeBuffer);
    renderer.setRenderTarget(originalRenderTarget);
  }

  renderOcclusionMapFromScene(
      renderer: THREE.WebGLRenderer, dimensions: THREE.Vector2,
      view_id: number) {
    // Compute our own read buffer.
    this.occlusionMeshMaterial.uniforms.uDepthTexture.value =
        this.depthTextures[view_id];
    this.scene.overrideMaterial = this.occlusionMeshMaterial;
    renderer.getDrawingBufferSize(dimensions);
    this.occlusionMapTexture.setSize(dimensions.x, dimensions.y);
    const renderTarget = this.occlusionMapTexture;
    renderer.setRenderTarget(renderTarget);
    const camera = renderer.xr.getCamera().cameras[view_id] || this.camera;
    const originalCameraLayers =
        Array.from(Array(32).keys())
            .filter(element => camera.layers.isEnabled(element));
    camera.layers.set(this.occludableItemsLayer);
    renderer.render(this.scene, camera);
    camera.layers.disableAll();
    originalCameraLayers.forEach(element => {
      camera.layers.enable(element);
    });
    this.scene.overrideMaterial = null;
  }

  renderOcclusionMapFromReadBuffer(
      renderer: THREE.WebGLRenderer, readBuffer: THREE.RenderTarget,
      dimensions: THREE.Vector2, view_id: number) {
    // Convert the readBuffer into an occlusion map.
    // Render depth into texture
    this.occlusionMapUniforms.tDiffuse.value = readBuffer.texture;
    this.occlusionMapUniforms.tDepth.value = readBuffer.depthTexture;
    this.occlusionMapUniforms.uDepthTexture.value = this.depthTextures[view_id];

    // First render the occlusion map to an intermediate buffer.
    renderer.getDrawingBufferSize(dimensions);
    this.occlusionMapTexture.setSize(dimensions.x, dimensions.y);
    renderer.setRenderTarget(this.occlusionMapTexture);
    this.occlusionMapQuad.render(renderer);
  }

  blurOcclusionMap(renderer: THREE.WebGLRenderer, dimensions: THREE.Vector2) {
    for (let i = 0; i < 3; i++) {
      this.kawaseBlurTargets[i].setSize(
          dimensions.x / (2 ** i), dimensions.y / (2 ** i));
    }
    for (let i = 0; i < 3; i++) {
      (this.kawaseBlurQuads[i].material as THREE.ShaderMaterial)
          .uniforms.uTexelSize.value.set(
              1 / (dimensions.x / (2 ** i)), 1 / (dimensions.y / (2 ** i)));
      (this.kawaseBlurQuads[this.kawaseBlurQuads.length - 1 - i].material as
       THREE.ShaderMaterial)
          .uniforms.uTexelSize.value.set(
              1 / (dimensions.x / (2 ** (i - 1))),
              1 / (dimensions.y / (2 ** (i - 1))));
    }
    renderer.setRenderTarget(this.kawaseBlurTargets[0]);
    this.kawaseBlurQuads[0].render(renderer);
    renderer.setRenderTarget(this.kawaseBlurTargets[1]);
    this.kawaseBlurQuads[1].render(renderer);
    renderer.setRenderTarget(this.kawaseBlurTargets[2]);
    this.kawaseBlurQuads[2].render(renderer);
    renderer.setRenderTarget(this.kawaseBlurTargets[1]);
    this.kawaseBlurQuads[3].render(renderer);
    renderer.setRenderTarget(this.kawaseBlurTargets[0]);
    this.kawaseBlurQuads[4].render(renderer);
    renderer.setRenderTarget(this.occlusionMapTexture);
    this.kawaseBlurQuads[5].render(renderer);
  }

  applyOcclusionMapToRenderedImage(
      renderer: THREE.WebGLRenderer, readBuffer?: THREE.WebGLRenderTarget,
      writeBuffer?: THREE.WebGLRenderTarget) {
    if (readBuffer && (this.renderToScreen || writeBuffer)) {
      this.occlusionUniforms.tDiffuse.value = readBuffer.texture;
      renderer.setRenderTarget(
          writeBuffer && !this.renderToScreen ? writeBuffer : null);
      this.occlusionQuad.render(renderer);
    }
  }

  dispose() {
    this.occlusionMeshMaterial.dispose();
    this.occlusionMapTexture.dispose();
    for (let i = 0; i < this.kawaseBlurQuads.length; i++) {
      this.kawaseBlurQuads[i].dispose();
    }
  }

  updateOcclusionMapUniforms(
      uniforms: ShaderUniforms, renderer: THREE.WebGLRenderer) {
    const camera = renderer.xr.getCamera().cameras[0] || this.camera;
    uniforms.tOcclusionMap.value = this.occlusionMapTexture.texture;
    uniforms.uOcclusionClipFromWorld.value.copy(camera.projectionMatrix)
        .multiply(camera.matrixWorldInverse);
  }
}
