import * as THREE from 'three';
import {
  clamp,
  dot,
  float,
  Fn,
  max,
  or,
  perspectiveDepthToViewZ,
  positionWorld,
  select,
  step,
  texture as tslTexture,
  uniform,
  uv,
  vec2,
  vec4,
  viewZToOrthographicDepth,
} from 'three/tsl';
import {NodeMaterial, QuadMesh, type WebGPURenderer} from 'three/webgpu';

import {OCCLUDABLE_ITEMS_LAYER} from '../../constants';
import type {WebGLOrWebGPURenderer} from '../../core/RendererTypes';
import type {ShaderUniforms} from '../../utils/Types';

import type {OcclusionPassBackend} from './OcclusionPass';

enum KawaseBlurMode {
  DOWN = 1,
  UP = 2,
}

function _createSampledTextureNode(
  texture: THREE.Texture,
  uvNode: ReturnType<typeof vec2>
) {
  return tslTexture(texture, uvNode);
}

type SampledTextureNode = ReturnType<typeof _createSampledTextureNode>;

interface KawasePassState {
  quad: QuadMesh;
  uTexelSize: {value: THREE.Vector2};
}

/**
 * WebGPU backend for `OcclusionPass` using Three.js `NodeMaterial`, `QuadMesh`,
 * and TSL shader nodes (`three/webgpu` and `three/tsl`).
 */
export class WebGPUOcclusionPass implements OcclusionPassBackend {
  private depthTextures: THREE.Texture[] = [];
  private depthNear: (number | undefined)[] = [];
  private depthViewMatrices: THREE.Matrix4[] = [];
  private depthProjectionMatrices: THREE.Matrix4[] = [];

  private readonly placeholderDepthTexture: THREE.DataTexture;
  private readonly placeholderColorTexture: THREE.DataTexture;

  private readonly uRawValueToMeters = uniform(8.0 / 65536.0);
  private readonly uFloatDepth = uniform(1.0);
  private readonly uCameraNear = uniform(0.1);
  private readonly uCameraFar = uniform(1000.0);
  private readonly uDepthViewMatrix = uniform(new THREE.Matrix4());
  private readonly uDepthProjectionMatrix = uniform(new THREE.Matrix4());

  private meshDepthTextureNode!: SampledTextureNode;
  private readBufferDepthTextureNode!: SampledTextureNode;
  private readBufferDiffuseNode!: SampledTextureNode;
  private readBufferVirtualDepthNode!: SampledTextureNode;
  private finalCompositeDiffuseNode!: SampledTextureNode;

  private readonly occlusionMeshMaterial: NodeMaterial;
  private readonly occlusionMapQuad: QuadMesh;
  private readonly occlusionMapTexture: THREE.RenderTarget;
  private readonly kawaseBlurTargets: THREE.RenderTarget[];
  private readonly kawaseBlurPasses: KawasePassState[];
  private readonly occlusionQuad: QuadMesh;

  private readonly lastOcclusionMapSize = new THREE.Vector2(0, 0);
  private readonly lastKawaseBlurSize = new THREE.Vector2(0, 0);
  private readonly renderDimensions = new THREE.Vector2();
  private disposed = false;

  constructor(
    private scene: THREE.Scene,
    private camera: THREE.PerspectiveCamera,
    useFloatDepth = true,
    public renderToScreen = false,
    private occludableItemsLayer = OCCLUDABLE_ITEMS_LAYER
  ) {
    this.placeholderDepthTexture = new THREE.DataTexture(
      new Float32Array([0]),
      1,
      1,
      THREE.RedFormat,
      THREE.FloatType
    );
    this.placeholderDepthTexture.needsUpdate = true;

    this.placeholderColorTexture = new THREE.DataTexture(
      new Uint8Array([0, 0, 0, 0]),
      1,
      1,
      THREE.RGBAFormat
    );
    this.placeholderColorTexture.needsUpdate = true;

    this.uFloatDepth.value = useFloatDepth ? 1.0 : 0.0;
    this.uCameraNear.value = camera.near;
    this.uCameraFar.value = camera.far;
    this.uDepthViewMatrix.value.copy(camera.matrixWorldInverse);
    this.uDepthProjectionMatrix.value.copy(camera.projectionMatrix);

    this.occlusionMeshMaterial = this.createOcclusionMeshMaterial();
    this.occlusionMapQuad = new QuadMesh(this.createOcclusionMapQuadMaterial());

    this.occlusionMapTexture = new THREE.RenderTarget(1, 1);
    this.kawaseBlurTargets = [
      new THREE.RenderTarget(1, 1),
      new THREE.RenderTarget(1, 1),
      new THREE.RenderTarget(1, 1),
    ];

    this.kawaseBlurPasses = [
      this.createKawaseBlurPass(
        KawaseBlurMode.DOWN,
        this.occlusionMapTexture.texture
      ),
      this.createKawaseBlurPass(
        KawaseBlurMode.DOWN,
        this.kawaseBlurTargets[0].texture
      ),
      this.createKawaseBlurPass(
        KawaseBlurMode.DOWN,
        this.kawaseBlurTargets[1].texture
      ),
      this.createKawaseBlurPass(
        KawaseBlurMode.UP,
        this.kawaseBlurTargets[2].texture
      ),
      this.createKawaseBlurPass(
        KawaseBlurMode.UP,
        this.kawaseBlurTargets[1].texture
      ),
      this.createKawaseBlurPass(
        KawaseBlurMode.UP,
        this.kawaseBlurTargets[0].texture
      ),
    ];

    this.occlusionQuad = new QuadMesh(this.createOcclusionCompositeMaterial());
  }

  private computeMetersFromSample(sampledDepthNode: SampledTextureNode) {
    const packed = sampledDepthNode.toVec4().rg;
    const floatMeters = packed.r.mul(this.uRawValueToMeters);
    const uint16Meters = dot(packed, vec2(255.0, 256.0 * 255.0)).mul(
      this.uRawValueToMeters
    );
    return select(this.uFloatDepth.greaterThan(0.5), floatMeters, uint16Meters);
  }

  private createOcclusionMeshMaterial(): NodeMaterial {
    const depthViewPosition = this.uDepthViewMatrix.mul(
      vec4(positionWorld, 1.0)
    );
    const virtualDepth = depthViewPosition.z.negate();
    const depthClipPosition =
      this.uDepthProjectionMatrix.mul(depthViewPosition);
    const depthNdc = depthClipPosition.xy.div(
      max(float(0.00001), depthClipPosition.w)
    );
    const texCoord = depthNdc.mul(0.5).add(0.5);
    const depthUv = vec2(texCoord.x, float(1.0).sub(texCoord.y));
    this.meshDepthTextureNode = tslTexture(
      this.placeholderDepthTexture,
      depthUv
    );

    const material = new NodeMaterial();
    material.fragmentNode = Fn(() => {
      const realDepth = this.computeMetersFromSample(this.meshDepthTextureNode);
      const outOfBounds = or(
        depthUv.x.lessThan(0.0),
        depthUv.x.greaterThan(1.0),
        depthUv.y.lessThan(0.0),
        depthUv.y.greaterThan(1.0),
        virtualDepth.lessThanEqual(0.0)
      );
      const isNotOccluded = select(
        outOfBounds,
        float(1.0),
        step(virtualDepth, realDepth)
      );
      return vec4(isNotOccluded, float(1.0), float(0.0), float(1.0));
    })();
    material.blending = THREE.NoBlending;
    material.lights = false;
    return material;
  }

  private createOcclusionMapQuadMaterial(): NodeMaterial {
    const texCoord = uv();
    const depthUv = vec2(texCoord.x, float(1.0).sub(texCoord.y));
    this.readBufferDiffuseNode = tslTexture(
      this.placeholderColorTexture,
      texCoord
    );
    this.readBufferDepthTextureNode = tslTexture(
      this.placeholderDepthTexture,
      depthUv
    );
    this.readBufferVirtualDepthNode = tslTexture(
      this.placeholderDepthTexture,
      texCoord
    );

    const material = new NodeMaterial();
    material.fragmentNode = Fn(() => {
      const realDepth = float(
        this.computeMetersFromSample(this.readBufferDepthTextureNode)
      );
      const fragCoordZ = float(this.readBufferVirtualDepthNode.toVec4().r);
      const viewZ = float(
        perspectiveDepthToViewZ(fragCoordZ, this.uCameraNear, this.uCameraFar)
      );
      const orthoDepth = float(
        viewZToOrthographicDepth(viewZ, this.uCameraNear, this.uCameraFar)
      );
      const virtualDepth = orthoDepth
        .mul(this.uCameraFar.sub(this.uCameraNear))
        .add(this.uCameraNear);
      return vec4(
        step(virtualDepth, realDepth),
        step(float(0.001), this.readBufferDiffuseNode.a),
        float(0.0),
        float(0.0)
      );
    })();
    material.blending = THREE.NoBlending;
    material.lights = false;
    return material;
  }

  private createKawaseBlurPass(
    mode: KawaseBlurMode,
    inputTexture: THREE.Texture
  ): KawasePassState {
    const uBlurSize = uniform(7.0);
    const uTexelSize = uniform(new THREE.Vector2());

    const material = new NodeMaterial();
    material.fragmentNode = Fn(() => {
      const baseUv = uv();
      const halfPixel = uTexelSize.mul(0.5);
      const offset = vec2(uBlurSize, uBlurSize);

      if (mode === KawaseBlurMode.DOWN) {
        const uv1 = baseUv.sub(halfPixel.mul(offset));
        const uv2 = baseUv.add(halfPixel.mul(offset));
        const uv3 = baseUv.sub(
          vec2(halfPixel.x, halfPixel.y.negate()).mul(offset)
        );
        const uv4 = baseUv.add(
          vec2(halfPixel.x, halfPixel.y.negate()).mul(offset)
        );
        const sum = tslTexture(inputTexture, baseUv)
          .mul(4.0)
          .add(tslTexture(inputTexture, uv1))
          .add(tslTexture(inputTexture, uv2))
          .add(tslTexture(inputTexture, uv3))
          .add(tslTexture(inputTexture, uv4));
        return sum.mul(0.125);
      }

      const uv1 = baseUv.add(
        vec2(halfPixel.x.mul(-2.0), float(0.0)).mul(offset)
      );
      const uv2 = baseUv.add(
        vec2(halfPixel.x.negate(), halfPixel.y).mul(offset)
      );
      const uv3 = baseUv.add(
        vec2(float(0.0), halfPixel.y.mul(2.0)).mul(offset)
      );
      const uv4 = baseUv.add(halfPixel.mul(offset));
      const uv5 = baseUv.add(
        vec2(halfPixel.x.mul(2.0), float(0.0)).mul(offset)
      );
      const uv6 = baseUv.add(
        vec2(halfPixel.x, halfPixel.y.negate()).mul(offset)
      );
      const uv7 = baseUv.add(
        vec2(float(0.0), halfPixel.y.mul(-2.0)).mul(offset)
      );
      const uv8 = baseUv.sub(halfPixel.mul(offset));

      const sum = tslTexture(inputTexture, uv1)
        .add(tslTexture(inputTexture, uv2).mul(2.0))
        .add(tslTexture(inputTexture, uv3))
        .add(tslTexture(inputTexture, uv4).mul(2.0))
        .add(tslTexture(inputTexture, uv5))
        .add(tslTexture(inputTexture, uv6).mul(2.0))
        .add(tslTexture(inputTexture, uv7))
        .add(tslTexture(inputTexture, uv8).mul(2.0));
      return sum.mul(0.0833);
    })();
    material.blending = THREE.NoBlending;
    material.lights = false;

    return {
      quad: new QuadMesh(material),
      uTexelSize,
    };
  }

  private createOcclusionCompositeMaterial(): NodeMaterial {
    const texCoord = uv();
    this.finalCompositeDiffuseNode = tslTexture(
      this.placeholderColorTexture,
      texCoord
    );
    const occlusionTexNode = tslTexture(
      this.occlusionMapTexture.texture,
      texCoord
    );
    const material = new NodeMaterial();
    material.fragmentNode = Fn(() => {
      const occlusionValue = clamp(
        occlusionTexNode.r.div(max(float(0.0001), occlusionTexNode.g)),
        float(0.0),
        float(1.0)
      );
      return this.finalCompositeDiffuseNode.mul(occlusionValue);
    })();
    material.blending = THREE.NoBlending;
    material.lights = false;
    return material;
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
    this.uRawValueToMeters.value = rawValueToMeters;
    this.depthNear[viewId] = depthNear;
    if (depthViewMatrix) {
      this.depthViewMatrices[viewId] = depthViewMatrix;
    }
    if (depthProjectionMatrix) {
      this.depthProjectionMatrices[viewId] = depthProjectionMatrix;
    }
    if (!(depthTexture instanceof THREE.ExternalTexture)) {
      depthTexture.needsUpdate = true;
    }
  }

  render(
    renderer: WebGLOrWebGPURenderer,
    writeBuffer?: THREE.RenderTarget,
    readBuffer?: THREE.RenderTarget,
    viewId = 0
  ) {
    const webgpuRenderer = renderer as WebGPURenderer;
    const originalRenderTarget = webgpuRenderer.getRenderTarget();
    const dimensions = this.renderDimensions;

    if (readBuffer == null) {
      this.renderOcclusionMapFromScene(webgpuRenderer, dimensions, viewId);
    } else {
      this.renderOcclusionMapFromReadBuffer(
        webgpuRenderer,
        readBuffer,
        dimensions,
        viewId
      );
    }

    this.blurOcclusionMap(webgpuRenderer, dimensions);
    this.applyOcclusionMapToRenderedImage(
      webgpuRenderer,
      readBuffer,
      writeBuffer
    );
    webgpuRenderer.setRenderTarget(originalRenderTarget);
  }

  private renderOcclusionMapFromScene(
    renderer: WebGPURenderer,
    dimensions: THREE.Vector2,
    viewId: number
  ) {
    const texture = this.depthTextures[viewId] ?? this.placeholderDepthTexture;
    this.meshDepthTextureNode.value = texture;

    const camera =
      (renderer.xr.getCamera() as THREE.ArrayCamera | undefined)?.cameras?.[
        viewId
      ] || this.camera;
    this.uDepthViewMatrix.value.copy(
      this.depthViewMatrices[viewId] || camera.matrixWorldInverse
    );
    this.uDepthProjectionMatrix.value.copy(
      this.depthProjectionMatrices[viewId] || camera.projectionMatrix
    );

    this.scene.overrideMaterial = this.occlusionMeshMaterial;
    renderer.getDrawingBufferSize(dimensions);
    this.resizeOcclusionMap(dimensions);
    renderer.setRenderTarget(this.occlusionMapTexture);
    renderer.clear();
    const originalCameraLayerMask = camera.layers.mask;
    camera.layers.set(this.occludableItemsLayer);
    renderer.render(this.scene, camera);
    camera.layers.mask = originalCameraLayerMask;
    this.scene.overrideMaterial = null;
  }

  private renderOcclusionMapFromReadBuffer(
    renderer: WebGPURenderer,
    readBuffer: THREE.RenderTarget,
    dimensions: THREE.Vector2,
    viewId: number
  ) {
    this.readBufferDiffuseNode.value = readBuffer.texture;
    this.readBufferVirtualDepthNode.value =
      readBuffer.depthTexture ?? this.placeholderDepthTexture;
    this.readBufferDepthTextureNode.value =
      this.depthTextures[viewId] ?? this.placeholderDepthTexture;

    renderer.getDrawingBufferSize(dimensions);
    this.resizeOcclusionMap(dimensions);
    renderer.setRenderTarget(this.occlusionMapTexture);
    this.occlusionMapQuad.render(renderer);
  }

  private blurOcclusionMap(
    renderer: WebGPURenderer,
    dimensions: THREE.Vector2
  ) {
    this.resizeKawaseBlur(dimensions);
    for (let i = 0; i < 3; i++) {
      this.kawaseBlurPasses[i].uTexelSize.value.set(
        1 / (dimensions.x / 2 ** i),
        1 / (dimensions.y / 2 ** i)
      );
      this.kawaseBlurPasses[
        this.kawaseBlurPasses.length - 1 - i
      ].uTexelSize.value.set(
        1 / (dimensions.x / 2 ** (i - 1)),
        1 / (dimensions.y / 2 ** (i - 1))
      );
    }

    renderer.setRenderTarget(this.kawaseBlurTargets[0]);
    this.kawaseBlurPasses[0].quad.render(renderer);
    renderer.setRenderTarget(this.kawaseBlurTargets[1]);
    this.kawaseBlurPasses[1].quad.render(renderer);
    renderer.setRenderTarget(this.kawaseBlurTargets[2]);
    this.kawaseBlurPasses[2].quad.render(renderer);
    renderer.setRenderTarget(this.kawaseBlurTargets[1]);
    this.kawaseBlurPasses[3].quad.render(renderer);
    renderer.setRenderTarget(this.kawaseBlurTargets[0]);
    this.kawaseBlurPasses[4].quad.render(renderer);
    renderer.setRenderTarget(this.occlusionMapTexture);
    this.kawaseBlurPasses[5].quad.render(renderer);
  }

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

  private applyOcclusionMapToRenderedImage(
    renderer: WebGPURenderer,
    readBuffer?: THREE.RenderTarget,
    writeBuffer?: THREE.RenderTarget
  ) {
    if (readBuffer && (this.renderToScreen || writeBuffer)) {
      this.finalCompositeDiffuseNode.value = readBuffer.texture;
      renderer.setRenderTarget(
        writeBuffer && !this.renderToScreen ? writeBuffer : null
      );
      this.occlusionQuad.render(renderer);
    }
  }

  updateOcclusionMapUniforms(
    uniforms: ShaderUniforms,
    renderer: WebGLOrWebGPURenderer
  ) {
    const camera =
      (renderer.xr.getCamera() as THREE.ArrayCamera | undefined)
        ?.cameras?.[0] || this.camera;
    uniforms.tOcclusionMap.value = this.occlusionMapTexture.texture;
    uniforms.uOcclusionClipFromWorld.value
      .copy(camera.projectionMatrix)
      .multiply(camera.matrixWorldInverse);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;

    const quads = [
      this.occlusionMapQuad,
      ...this.kawaseBlurPasses.map((pass) => pass.quad),
      this.occlusionQuad,
    ];
    const resources: Array<{dispose(): void}> = [
      this.placeholderDepthTexture,
      this.placeholderColorTexture,
      this.occlusionMeshMaterial,
      this.occlusionMapTexture,
      ...this.kawaseBlurTargets,
      ...quads.flatMap((quad) => [
        quad.material as THREE.Material,
        quad.geometry,
      ]),
    ];

    let firstError: unknown;
    for (const resource of resources) {
      try {
        resource.dispose();
      } catch (error: unknown) {
        firstError ??= error;
      }
    }

    this.kawaseBlurTargets.length = 0;
    this.kawaseBlurPasses.length = 0;
    this.depthTextures.length = 0;
    this.depthNear.length = 0;
    this.depthViewMatrices.length = 0;
    this.depthProjectionMatrices.length = 0;

    if (firstError !== undefined) throw firstError;
  }
}
