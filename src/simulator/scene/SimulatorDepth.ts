import * as THREE from 'three';

import {
  isWebGPURenderer,
  type WebGLOrWebGPURenderer,
} from '../../core/RendererTypes';
import {Depth} from '../../depth/Depth';

import type {SimulatorDepthRenderer} from './SimulatorDepthRenderer';
import {SimulatorDepthWebGLRenderer} from './SimulatorDepthWebGLRenderer';
import {SimulatorScene} from './SimulatorScene';

export {type SimulatorDepthRenderer};

export class SimulatorDepth {
  private renderer!: WebGLOrWebGPURenderer;
  private depthRenderer!: SimulatorDepthRenderer;
  private camera!: THREE.Camera;
  private depth!: Depth;
  depthWidth = 160;
  depthHeight = 160;
  depthRenderTarget!: THREE.WebGLRenderTarget;
  depthBuffer!: Float32Array;
  private readonly tempClearColor = new THREE.Color();

  depthCamera!: THREE.Camera;
  /**
   * If true, copies the rendering camera's projection matrix each frame.
   */
  autoUpdateDepthCameraProjection = true;
  /**
   * If true, copies the rendering camera's transform each frame.
   */
  autoUpdateDepthCameraTransform = true;

  private projectionMatrixArray = new Float32Array(16);

  // Don't queue a new updateDepth while the previous async pass is
  // still in flight. simulatorUpdate fires once per frame, but
  // updateDepth() resolves via a WebGL fence poll that typically takes
  // longer than a frame on desktop. Without this guard the
  // setTimeout-based fence polling chains stack up and dominate the
  // main thread.
  private updateInFlight = false;
  private disposed = false;
  private resourcesDisposed = false;

  /**
   * Longest a depth buffer is allowed to go without being refreshed while
   * nothing detectable has changed, in milliseconds.
   *
   * This is not only a hedge against animation the skip cannot see, such as
   * skinning or vertex shaders. It is also what keeps the depth mesh's
   * position attribute version advancing while the scene sits still.
   * `FaceRecognizer`, `HumanRecognizer`, and `ObjectDetector` each cache a
   * cloned depth mesh, and its BVH, keyed on that version. If this were
   * removed, a stationary scene would freeze the version, those caches would
   * never invalidate, and per-landmark raycasts would keep hitting a stale
   * clone. That is the failure this repository already fixed once, where the
   * face wireframe only appeared while the camera was moving.
   *
   * Raising it trades depth freshness for fewer readbacks; setting it to
   * `Infinity` would reintroduce that bug.
   */
  maxDepthAgeMs = 500;

  private lastDepthPosition = new THREE.Vector3(NaN, NaN, NaN);
  private lastDepthQuaternion = new THREE.Quaternion(NaN, NaN, NaN, NaN);
  private lastSceneSignature = NaN;
  private lastDepthUpdateMs = -Infinity;

  // Scratch used to hash the raw bits of a float, so the signature reacts to
  // any change rather than relying on a tolerance.
  private readonly hashFloat = new Float64Array(1);
  private readonly hashInts = new Int32Array(this.hashFloat.buffer);

  constructor(private simulatorScene: SimulatorScene) {}

  get depthMaterial(): THREE.Material {
    return this.depthRenderer.depthMaterial;
  }

  /**
   * Initialize Simulator Depth.
   */
  async init(
    renderer: WebGLOrWebGPURenderer,
    camera: THREE.Camera,
    depth: Depth
  ): Promise<void> {
    this.disposed = false;
    this.resourcesDisposed = false;
    this.renderer = renderer;
    this.camera = camera;
    this.depth = depth;

    if (this.camera instanceof THREE.PerspectiveCamera) {
      this.depthCamera = new THREE.PerspectiveCamera();
    } else if (this.camera instanceof THREE.OrthographicCamera) {
      this.depthCamera = new THREE.OrthographicCamera();
    } else {
      throw new Error('Unknown camera type');
    }
    this.depthCamera.copy(this.camera, /*recursive=*/ false);
    this.createRenderTarget();
    if (isWebGPURenderer(this.renderer)) {
      const {SimulatorDepthWebGPURenderer} = await import(
        './SimulatorDepthWebGPURenderer.js'
      );
      if (this.disposed) return;
      this.depthRenderer = new SimulatorDepthWebGPURenderer(this.renderer);
    } else {
      this.depthRenderer = new SimulatorDepthWebGLRenderer(this.renderer);
    }
  }

  createRenderTarget() {
    this.depthRenderTarget = new THREE.WebGLRenderTarget(
      this.depthWidth,
      this.depthHeight,
      {
        format: THREE.RedFormat,
        type: THREE.FloatType,
      }
    );
    this.depthBuffer = new Float32Array(this.depthWidth * this.depthHeight);
  }

  update() {
    if (this.disposed) return;
    this.updateDepthCamera();
    // Skip if an earlier updateDepth() is still resolving its readback
    // fence. We'd just race ourselves and stack up promises (the
    // setTimeout-based fence poll inside readRenderTargetPixelsAsync
    // was a dominant main-thread cost in perf traces before this).
    if (this.updateInFlight) return;
    // Reading the depth target back stalls the GPU pipeline: the buffer is
    // only 160x160 but the readback has to wait for the render to finish, so
    // it costs far more than its size suggests. When neither the view nor
    // anything in the scene has moved the result would be identical, so skip
    // the whole render + readback and keep the previous buffer.
    if (!this.depthNeedsUpdate()) return;
    this.renderDepthScene();
    this.markDepthUpdated();
    this.updateInFlight = true;
    this.updateDepth().finally(() => {
      this.updateInFlight = false;
      if (this.disposed) this.disposeResources();
    });
  }

  /**
   * Whether the depth buffer would differ from the one already captured.
   *
   * @returns True when the camera moved, the scene moved, or the buffer has
   * gone stale.
   */
  private depthNeedsUpdate() {
    if (performance.now() - this.lastDepthUpdateMs >= this.maxDepthAgeMs) {
      return true;
    }
    if (
      !this.depthCamera.position.equals(this.lastDepthPosition) ||
      !this.depthCamera.quaternion.equals(this.lastDepthQuaternion)
    ) {
      return true;
    }
    return this.computeSceneSignature() !== this.lastSceneSignature;
  }

  /**
   * Cheap hash over the world transforms of everything the depth pass draws.
   *
   * Anything that moves, rotates, scales, or is shown or hidden changes the
   * hash, so a still camera in front of a moving object still refreshes. This
   * is arithmetic over a few hundred nodes, which is orders of magnitude
   * cheaper than the GPU stall a readback costs.
   *
   * @returns A hash of the scene's current visible transforms.
   */
  private computeSceneSignature() {
    let hash = 0;
    this.simulatorScene.traverse((object: THREE.Object3D) => {
      hash = (hash ^ (object.visible ? 0x9e3779b9 : 0x85ebca6b)) | 0;
      if (!object.visible) return;
      const e = object.matrixWorld.elements;
      for (let i = 0; i < 16; i++) {
        this.hashFloat[0] = e[i];
        hash = Math.imul(hash ^ this.hashInts[0], 0x27220a95) | 0;
        hash = Math.imul(hash ^ this.hashInts[1], 0x27220a95) | 0;
      }
    });
    return hash;
  }

  private markDepthUpdated() {
    this.lastDepthPosition.copy(this.depthCamera.position);
    this.lastDepthQuaternion.copy(this.depthCamera.quaternion);
    this.lastSceneSignature = this.computeSceneSignature();
    this.lastDepthUpdateMs = performance.now();
  }

  private updateDepthCamera() {
    const renderingCamera = this.camera;
    const depthCamera = this.depthCamera;
    if (this.autoUpdateDepthCameraProjection) {
      depthCamera.projectionMatrix.copy(renderingCamera.projectionMatrix);
      depthCamera.projectionMatrixInverse.copy(
        renderingCamera.projectionMatrixInverse
      );
    }
    if (this.autoUpdateDepthCameraTransform) {
      depthCamera.position.copy(renderingCamera.position);
      depthCamera.rotation.order = renderingCamera.rotation.order;
      depthCamera.quaternion.copy(renderingCamera.quaternion);
      depthCamera.scale.copy(renderingCamera.scale);
      depthCamera.matrix.copy(renderingCamera.matrix);
      depthCamera.matrixWorld.copy(renderingCamera.matrixWorld);
      depthCamera.matrixWorldInverse.copy(renderingCamera.matrixWorldInverse);
    }
  }

  private renderDepthScene() {
    const originalRenderTarget = this.renderer.getRenderTarget();
    const originalClearColor = this.renderer.getClearColor(this.tempClearColor);
    const originalClearAlpha = this.renderer.getClearAlpha();
    this.renderer.setRenderTarget(this.depthRenderTarget);
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.clear();
    this.simulatorScene.overrideMaterial = this.depthRenderer.depthMaterial;
    this.renderer.render(this.simulatorScene, this.depthCamera);
    this.simulatorScene.overrideMaterial = null;
    this.renderer.setClearColor(originalClearColor, originalClearAlpha);
    this.renderer.setRenderTarget(
      originalRenderTarget as THREE.WebGLRenderTarget | null
    );
  }

  private async updateDepth() {
    // Cache the projection matrix and transform of the rendered depth.
    const projectionMatrix = this.depthCamera.projectionMatrix.clone();
    const transform = new XRRigidTransform(
      this.depthCamera.position,
      this.depthCamera.quaternion
    );

    const result = await this.depthRenderer.readRenderTargetPixels(
      this.depthRenderTarget,
      this.depthWidth,
      this.depthHeight,
      this.depthBuffer
    );
    if (this.disposed) return;

    this.depthRenderer.unpackDepthPixels(
      result,
      this.depthWidth,
      this.depthHeight,
      this.depthBuffer
    );

    projectionMatrix.toArray(this.projectionMatrixArray);
    const depthData = {
      width: this.depthWidth,
      height: this.depthHeight,
      data: this.depthBuffer.buffer,
      rawValueToMeters: 1.0,
      projectionMatrix: this.projectionMatrixArray,
      transform: transform,
    };

    this.depth.updateCPUDepthData(
      depthData as XRCPUDepthInformation,
      0,
      'float32'
    );
  }

  dispose() {
    this.disposed = true;
    if (!this.updateInFlight) this.disposeResources();
  }

  private disposeResources() {
    if (this.resourcesDisposed) return;
    this.resourcesDisposed = true;
    this.depthRenderTarget?.dispose();
    this.depthRenderer?.dispose();
  }
}
