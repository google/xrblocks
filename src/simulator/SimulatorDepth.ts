import * as THREE from 'three';

import {Depth} from '../depth/Depth';

import {SimulatorDepthMaterial} from './SimulatorDepthMaterial';
import {SimulatorScene} from './SimulatorScene';

export class SimulatorDepth {
  private renderer!: THREE.WebGLRenderer;
  private camera!: THREE.Camera;
  private depth!: Depth;
  depthWidth = 160;
  depthHeight = 160;
  depthBufferSlice = new Float32Array();
  depthMaterial!: SimulatorDepthMaterial;
  depthRenderTarget!: THREE.WebGLRenderTarget;
  depthBuffer!: Float32Array;

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

  constructor(private simulatorScene: SimulatorScene) {}

  /**
   * Initialize Simulator Depth.
   */
  init(renderer: THREE.WebGLRenderer, camera: THREE.Camera, depth: Depth) {
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
    this.depthMaterial = new SimulatorDepthMaterial();
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
    this.updateDepthCamera();
    this.renderDepthScene();
    this.updateDepth();
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
    this.renderer.setRenderTarget(this.depthRenderTarget);
    this.simulatorScene.overrideMaterial = this.depthMaterial;
    this.renderer.render(this.simulatorScene, this.depthCamera);
    this.simulatorScene.overrideMaterial = null;
    this.renderer.setRenderTarget(originalRenderTarget);
  }

  private updateDepth() {
    // We preventively unbind the PIXEL_PACK_BUFFER before reading from the
    // render target in case external libraries (Spark.js) left it bound.
    const context = this.renderer.getContext() as WebGL2RenderingContext;
    context.bindBuffer(context.PIXEL_PACK_BUFFER, null);

    this.renderer.readRenderTargetPixels(
      this.depthRenderTarget,
      0,
      0,
      this.depthWidth,
      this.depthHeight,
      this.depthBuffer
    );

    // Flip the depth buffer.
    if (this.depthBufferSlice.length != this.depthWidth) {
      this.depthBufferSlice = new Float32Array(this.depthWidth);
    }
    for (let i = 0; i < this.depthHeight / 2; ++i) {
      const j = this.depthHeight - 1 - i;
      const i_offset = i * this.depthWidth;
      const j_offset = j * this.depthWidth;

      // Copy row i to a temp slice
      this.depthBufferSlice.set(
        this.depthBuffer.subarray(i_offset, i_offset + this.depthWidth)
      );
      // Copy row j to row i
      this.depthBuffer.copyWithin(
        i_offset,
        j_offset,
        j_offset + this.depthWidth
      );
      // Copy the temp slice (original row i) to row j
      this.depthBuffer.set(this.depthBufferSlice, j_offset);
    }

    this.depthCamera.projectionMatrix.toArray(this.projectionMatrixArray);
    const depthData = {
      width: this.depthWidth,
      height: this.depthHeight,
      data: this.depthBuffer.buffer,
      rawValueToMeters: 1.0,
      projectionMatrix: this.projectionMatrixArray,
      transform: new XRRigidTransform(
        this.depthCamera.position,
        this.depthCamera.quaternion
      ),
    };

    this.depth.updateCPUDepthData(depthData as XRCPUDepthInformation, 0);
  }
}
