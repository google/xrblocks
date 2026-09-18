import type {SparkRenderer} from '@sparkjsdev/spark';
import * as THREE from 'three';
import {FullScreenQuad} from 'three/addons/postprocessing/Pass.js';
import type {QuadMesh} from 'three/webgpu';

import {Registry} from '../../../core/components/Registry';
import type {WebGLOrWebGPURenderer} from '../../../core/RendererTypes';
import {SparkRendererHolder} from '../../../utils/SparkRendererHolder';
import type {SimulatorCamera} from '../../SimulatorCamera';

/**
 * Dependencies required by a simulator compositor implementation.
 */
export interface SimulatorCompositorDeps {
  renderer: WebGLOrWebGPURenderer;
  simulatorScene: THREE.Scene;
  renderMainScene: (cameraOverride?: THREE.Camera) => void;
  registry: Registry;
  simulatorCamera?: SimulatorCamera;
  stencil: boolean;
  blendingMode: 'normal' | 'screen';
}

/**
 * Interface for compositing the simulator scene and the main XR scene.
 */
export interface SimulatorCompositor {
  renderFrame(renderCamera: THREE.Camera, mainCamera: THREE.Camera): void;
  setBackgroundVideo(texture?: THREE.Texture): void;
  dispose(): void;
}

/**
 * Abstract base compositor providing shared simulator scene pass, background video quad,
 * and SparkRenderer linear encoding state management.
 */
export abstract class BaseSimulatorCompositor implements SimulatorCompositor {
  private readonly previousAutoClearColor: boolean;
  protected backgroundVideoQuad?: FullScreenQuad | QuadMesh;
  private sparkRenderer?: SparkRenderer;
  protected readonly renderSimulatorSceneToCanvasBound =
    this.renderSimulatorSceneToCanvas.bind(this);

  constructor(protected readonly deps: SimulatorCompositorDeps) {
    this.previousAutoClearColor = deps.renderer.autoClearColor;
    deps.renderer.autoClearColor = false;
  }

  abstract renderFrame(
    renderCamera: THREE.Camera,
    mainCamera: THREE.Camera
  ): void;

  protected setSparkEncodeLinear(value: boolean): void {
    this.sparkRenderer ??=
      this.deps.registry.get(SparkRendererHolder)?.renderer;
    if (this.sparkRenderer) {
      this.sparkRenderer.encodeLinear = value;
    }
  }

  setBackgroundVideo(videoTexture?: THREE.Texture): void {
    if (this.backgroundVideoQuad) {
      (this.backgroundVideoQuad.material as THREE.Material).dispose();
      if ('dispose' in this.backgroundVideoQuad) {
        this.backgroundVideoQuad.dispose();
      }
      this.backgroundVideoQuad = undefined;
    }
    if (videoTexture) {
      this.backgroundVideoQuad = this.createBackgroundVideoQuad(videoTexture);
    }
  }

  protected createBackgroundVideoQuad(
    videoTexture: THREE.Texture
  ): FullScreenQuad | QuadMesh {
    return new FullScreenQuad(new THREE.MeshBasicMaterial({map: videoTexture}));
  }

  protected renderSimulatorScenePass(
    renderCamera: THREE.Camera,
    mainCamera: THREE.Camera
  ): void {
    this.deps.simulatorCamera?.onBeforeSimulatorSceneRender(
      mainCamera,
      this.renderSimulatorSceneToCanvasBound
    );
    this.renderSimulatorSceneToCanvas(renderCamera);
    this.deps.simulatorCamera?.onSimulatorSceneRendered();
  }

  protected renderSimulatorSceneToCanvas(camera: THREE.Camera): void {
    const {renderer, simulatorScene} = this.deps;
    this.setSparkEncodeLinear(false);
    renderer.setRenderTarget(null);
    if (this.backgroundVideoQuad) {
      this.backgroundVideoQuad.render(renderer as never);
    }
    this.clearBeforeSimulatorScene();
    renderer.render(simulatorScene, camera);
    renderer.clearDepth();
  }

  protected clearBeforeSimulatorScene(): void {}

  dispose(): void {
    this.setBackgroundVideo(undefined);
    this.deps.renderer.autoClearColor = this.previousAutoClearColor;
  }
}
