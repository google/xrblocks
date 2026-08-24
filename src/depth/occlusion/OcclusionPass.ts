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
  UP = 2,
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
  private depthNear: (number | undefined)[] = [];
  private depthViewMatrices: THREE.Matrix4[] = [];
  private depthProjectionMatrices: THREE.Matrix4[] = [];
  // Cached dimensions of the render targets so we only call setSize()
  // when they actually changed. setSize() forces a GPU texture
  // reallocation even when called with the same dimensions, which
  // showed up as ~150 ms in a portals trace from a steady-state frame
  // loop (renderer drawing-buffer size never changes mid-session).
  private lastOcclusionMapSize = new THREE.Vector2(0, 0);
  private lastKawaseBlurSize = new THREE.Vector2(0, 0);
  private readonly renderDimensions = new THREE.Vector2();

  constructor(
    private scene: THREE.Scene,
    private camera: THREE.PerspectiveCamera,
    useFloatDepth = true,
    public renderToScreen = false,
    private occludableItemsLayer = OCCLUDABLE_ITEMS_LAYER
  ) {
    super();

    this.occlusionMeshMaterial = new OcclusionMapMeshMaterial(
      camera,
      useFloatDepth
    );

    this.occlusionMapUniforms = {
      uDepthTexture: {value: null},
      uDepthTextureArray: {value: null},
      uViewId: {value: 0.0},
      uIsTextureArray: {value: 0.0},
      uUvTransform: {value: new THREE.Matrix4()},
      uRawValueToMeters: {value: 8.0 / 65536.0},
      uAlpha: {value: 0.75},
      tDiffuse: {value: null},
      tDepth: {value: null},
      uFloatDepth: {value: useFloatDepth},
      cameraFar: {value: camera.far},
      cameraNear: {value: camera.near},
    };
    this.occlusionMapQuad = new FullScreenQuad(
      new THREE.ShaderMaterial({
        name: 'OcclusionMapShader',
        uniforms: this.occlusionMapUniforms,
        vertexShader: OcclusionMapShader.vertexShader,
        fragmentShader: OcclusionMapShader.fragmentShader,
      })
    );
    this.occlusionMapTexture = new THREE.WebGLRenderTarget();

    this.kawaseBlurTargets = [
      new THREE.WebGLRenderTarget(), // 1/2 resolution
      new THREE.WebGLRenderTarget(), // 1/4 resolution
      new THREE.WebGLRenderTarget(), // 1/8 resolution
    ];
    this.kawaseBlurQuads = [
      this.setupKawaseBlur(
        KawaseBlurMode.DOWN,
        this.occlusionMapTexture.texture
      ),
      this.setupKawaseBlur(
        KawaseBlurMode.DOWN,
        this.kawaseBlurTargets[0].texture
      ),
      this.setupKawaseBlur(
        KawaseBlurMode.DOWN,
        this.kawaseBlurTargets[1].texture
      ),
      this.setupKawaseBlur(
        KawaseBlurMode.UP,
        this.kawaseBlurTargets[2].texture
      ),
      this.setupKawaseBlur(
        KawaseBlurMode.UP,
        this.kawaseBlurTargets[1].texture
      ),
      this.setupKawaseBlur(
        KawaseBlurMode.UP,
        this.kawaseBlurTargets[0].texture
      ),
    ];

    this.occlusionUniforms = {
      tDiffuse: {value: null},
      tOcclusionMap: {value: this.occlusionMapTexture.texture},
    };
    this.occlusionQuad = new FullScreenQuad(
      new THREE.ShaderMaterial({
        name: 'OcclusionShader',
        uniforms: this.occlusionUniforms,
        vertexShader: OcclusionShader.vertexShader,
        fragmentShader: OcclusionShader.fragmentShader,
      })
    );

    this.occludableItemsLayer = occludableItemsLayer;
  }

  private setupKawaseBlur(mode: KawaseBlurMode, inputTexture: THREE.Texture) {
    const uniforms = {
      uBlurSize: {value: 7.0},
      uTexelSize: {value: new THREE.Vector2()},
      tDiffuse: {value: inputTexture},
    };
    const kawase1Material = new THREE.ShaderMaterial({
      name: 'Kawase',
      uniforms: uniforms,
      vertexShader: KawaseBlurShader.vertexShader,
      fragmentShader: KawaseBlurShader.fragmentShader,
      defines: {MODE: mode},
    });
    return new FullScreenQuad(kawase1Material);
  }

  setDepthTexture(
    depthTexture: THREE.Texture,
    rawValueToMeters: number,
    viewId: number,
    depthNear?: number,
    depthViewMatrix?: THREE.Matrix4,
    depthProjectionMatrix?: THREE.Matrix4
  ) {
    this.depthTextures[viewId] = depthTexture;
    this.occlusionMapUniforms.uRawValueToMeters.value = rawValueToMeters;
    this.occlusionMeshMaterial.uniforms.uRawValueToMeters.value =
      rawValueToMeters;
    this.depthNear[viewId] = depthNear;
    if (depthViewMatrix) {
      this.depthViewMatrices[viewId] = depthViewMatrix;
    }
    if (depthProjectionMatrix) {
      this.depthProjectionMatrices[viewId] = depthProjectionMatrix;
    }
    depthTexture.needsUpdate = true;
  }

  /**
   * Render the occlusion map.
   * @param renderer - The three.js renderer.
   * @param writeBuffer - The buffer to write the final result.
   * @param readBuffer - The buffer for the current of virtual depth.
   * @param viewId - The view to render.
   */
  render(
    renderer: THREE.WebGLRenderer,
    writeBuffer?: THREE.WebGLRenderTarget,
    readBuffer?: THREE.WebGLRenderTarget,
    viewId = 0
  ) {
    const originalRenderTarget = renderer.getRenderTarget();
    const dimensions = this.renderDimensions;
    if (readBuffer == null) {
      this.renderOcclusionMapFromScene(renderer, dimensions, viewId);
    } else {
      this.renderOcclusionMapFromReadBuffer(
        renderer,
        readBuffer,
        dimensions,
        viewId
      );
    }

    // Blur the occlusion map
    this.blurOcclusionMap(renderer, dimensions);

    // Fuse the rendered image and the occlusion map.
    this.applyOcclusionMapToRenderedImage(renderer, readBuffer, writeBuffer);
    renderer.setRenderTarget(originalRenderTarget);
  }

  renderOcclusionMapFromScene(
    renderer: THREE.WebGLRenderer,
    dimensions: THREE.Vector2,
    viewId: number
  ) {
    // Compute our own read buffer.
    const texture = this.depthTextures[viewId];
    const isTextureArray = texture instanceof THREE.ExternalTexture;
    this.occlusionMeshMaterial.uniforms.uIsTextureArray.value = isTextureArray
      ? 1.0
      : 0;
    this.occlusionMeshMaterial.uniforms.uViewId.value = viewId;
    if (isTextureArray) {
      this.occlusionMeshMaterial.uniforms.uDepthTextureArray.value = texture;
      this.occlusionMeshMaterial.uniforms.uDepthNear.value =
        this.depthNear[viewId];
    } else {
      this.occlusionMeshMaterial.uniforms.uDepthTexture.value = texture;
    }
    const camera = renderer.xr.getCamera().cameras[viewId] || this.camera;
    this.occlusionMeshMaterial.uniforms.uDepthViewMatrix.value =
      this.depthViewMatrices[viewId] || camera.matrixWorldInverse;
    this.occlusionMeshMaterial.uniforms.uDepthProjectionMatrix.value =
      this.depthProjectionMatrices[viewId] || camera.projectionMatrix;
    this.scene.overrideMaterial = this.occlusionMeshMaterial;
    renderer.getDrawingBufferSize(dimensions);
    this.resizeOcclusionMap(dimensions);
    const renderTarget = this.occlusionMapTexture;
    renderer.setRenderTarget(renderTarget);
    const originalCameraLayerMask = camera.layers.mask;
    camera.layers.set(this.occludableItemsLayer);
    renderer.render(this.scene, camera);
    camera.layers.mask = originalCameraLayerMask;
    this.scene.overrideMaterial = null;
  }

  renderOcclusionMapFromReadBuffer(
    renderer: THREE.WebGLRenderer,
    readBuffer: THREE.RenderTarget,
    dimensions: THREE.Vector2,
    viewId: number
  ) {
    // Convert the readBuffer into an occlusion map.
    // Render depth into texture
    this.occlusionMapUniforms.tDiffuse.value = readBuffer.texture;
    this.occlusionMapUniforms.tDepth.value = readBuffer.depthTexture;
    const texture = this.depthTextures[viewId];
    const isTextureArray = texture instanceof THREE.ExternalTexture;
    // NOTE: occlusionMapQuad (rendered below) is a ShaderMaterial whose
    // fragment shader is OcclusionMapShader (occlusion_map.glsl), and it
    // reads its uniforms from `occlusionMapUniforms` -- not from
    // `occlusionMeshMaterial.uniforms`, which only backs the
    // scene.overrideMaterial used by renderOcclusionMapFromScene(). Writing
    // the environment depth texture into occlusionMeshMaterial here left
    // occlusionMapQuad's uDepthTexture unbound, so it sampled as 0,
    // producing a zero occlusion mask (fully black output). See #531.
    //
    // Also note: OcclusionMapShader's fragment shader currently only
    // declares `uniform sampler2D uDepthTexture` and has no
    // texture-array/uDepthNear/uViewId handling (unlike
    // OcclusionMapMeshMaterial's shader), so the isTextureArray branch
    // below is not yet functional for this read-buffer path. Tracking
    // that as a follow-up rather than expanding scope of this fix.
    this.occlusionMapUniforms.uIsTextureArray.value = isTextureArray ? 1.0 : 0;
    this.occlusionMapUniforms.uViewId.value = viewId;
    if (isTextureArray) {
      this.occlusionMapUniforms.uDepthTextureArray.value = texture;
    } else {
      this.occlusionMapUniforms.uDepthTexture.value = texture;
    }
    // First render the occlusion map to an intermediate buffer.
    renderer.getDrawingBufferSize(dimensions);
    this.resizeOcclusionMap(dimensions);
    renderer.setRenderTarget(this.occlusionMapTexture);
    this.occlusionMapQuad.render(renderer);
  }

  blurOcclusionMap(renderer: THREE.WebGLRenderer, dimensions: THREE.Vector2) {
    this.resizeKawaseBlur(dimensions);
    for (let i = 0; i < 3; i++) {
      (
        this.kawaseBlurQuads[i].material as THREE.ShaderMaterial
      ).uniforms.uTexelSize.value.set(
        1 / (dimensions.x / 2 ** i),
        1 / (dimensions.y / 2 ** i)
      );
      (
        this.kawaseBlurQuads[this.kawaseBlurQuads.length - 1 - i]
          .material as THREE.ShaderMaterial
      ).uniforms.uTexelSize.value.set(
        1 / (dimensions.x / 2 ** (i - 1)),
        1 / (dimensions.y / 2 ** (i - 1))
      );
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

  // Only call setSize() when the cached dimensions have actually
  // changed. setSize triggers a render-target reallocation on every
  // call (no internal short-circuit), and getDrawingBufferSize returns
  // the same value frame after frame in a steady session.
  private resizeOcclusionMap(dimensions: THREE.Vector2) {
    if (
      this.lastOcclusionMapSize.x === dimensions.x &&
      this.lastOcclusionMapSize.y === dimensions.y
    ) {
      return;
    }
    this.lastOcclusionMapSize.copy(dimensions);
    this.occlusionMapTexture.setSize(dimensions.x, dimensions.y);
  }

  private resizeKawaseBlur(dimensions: THREE.Vector2) {
    if (
      this.lastKawaseBlurSize.x === dimensions.x &&
      this.lastKawaseBlurSize.y === dimensions.y
    ) {
      return;
    }
    this.lastKawaseBlurSize.copy(dimensions);
    for (let i = 0; i < 3; i++) {
      this.kawaseBlurTargets[i].setSize(
        dimensions.x / 2 ** i,
        dimensions.y / 2 ** i
      );
    }
  }

  applyOcclusionMapToRenderedImage(
    renderer: THREE.WebGLRenderer,
    readBuffer?: THREE.WebGLRenderTarget,
    writeBuffer?: THREE.WebGLRenderTarget
  ) {
    if (readBuffer && (this.renderToScreen || writeBuffer)) {
      this.occlusionUniforms.tDiffuse.value = readBuffer.texture;
      renderer.setRenderTarget(
        writeBuffer && !this.renderToScreen ? writeBuffer : null
      );
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
    uniforms: ShaderUniforms,
    renderer: THREE.WebGLRenderer
  ) {
    const camera = renderer.xr.getCamera().cameras[0] || this.camera;
    uniforms.tOcclusionMap.value = this.occlusionMapTexture.texture;
    uniforms.uOcclusionClipFromWorld.value
      .copy(camera.projectionMatrix)
      .multiply(camera.matrixWorldInverse);
  }
}
