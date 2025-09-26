import * as THREE from 'three';

import {Options} from '../Options';
import {MeshScript} from '../Script';

/**
 * Defines the possible XR modes.
 */
export type XRMode = 'AR'|'VR';

export type XRTransitionToVROptions = {
  /** The target opacity. */
  targetAlpha?: number;
  /** The target color. Defaults to `defaultBackgroundColor`. */
  color?: THREE.Color | number;
}

/**
 * Manages smooth transitions between AR (transparent) and VR (colored)
 * backgrounds within an active XR session.
 */
export class XRTransition extends
    MeshScript<THREE.SphereGeometry, THREE.MeshBasicMaterial> {
  ignoreReticleRaycast = true;
  static dependencies = {
    renderer: THREE.WebGLRenderer,
    camera: THREE.Camera,
    timer: THREE.Timer,
    scene: THREE.Scene,
    options: Options,
  };

  /** Current XR mode, either 'AR' or 'VR'. Defaults to 'AR'. */
  public currentMode: XRMode = 'AR';

  /** The duration in seconds for the fade-in and fade-out transitions. */
  private transitionTime = 1.5;
  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private sceneCamera!: THREE.Camera;
  private timer!: THREE.Timer;
  private targetAlpha = 0;
  private defaultBackgroundColor = new THREE.Color(0xffffff);

  constructor() {
    const geometry = new THREE.SphereGeometry(1, 64, 32);
    const material = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0,
      depthTest: false,
      side: THREE.BackSide,  // Render on the inside of the sphere.
    });
    super(geometry, material);
    this.ignoreReticleRaycast = true;
    this.renderOrder = -Infinity;
  }

  init({renderer, camera, timer, scene, options}: {
    renderer: THREE.WebGLRenderer,
    camera: THREE.Camera,
    timer: THREE.Timer,
    scene: THREE.Scene,
    options: Options
  }) {
    this.renderer = renderer;
    this.sceneCamera = camera;
    this.timer = timer;
    this.scene = scene;
    this.transitionTime = options.transition.transitionTime;
    this.defaultBackgroundColor.set(options.transition.defaultBackgroundColor);
    this.material.color.copy(this.defaultBackgroundColor);
    this.scene.add(this);
  }

  /**
   * Starts the transition to a VR background.
   * @param options - Optional parameters.
   */
  toVR({targetAlpha = 1.0, color}: XRTransitionToVROptions = {}) {
    this.targetAlpha = THREE.MathUtils.clamp(targetAlpha, 0, 1);
    this.material.color.set(color ?? this.defaultBackgroundColor);
    this.currentMode = 'VR';
  }

  /**
   * Starts the transition to a transparent AR background.
   */
  toAR() {
    this.targetAlpha = 0.0;
    this.currentMode = 'AR';
  }

  update() {
    // Always keep the fade mesh centered on the active camera.
    if (this.renderer.xr.isPresenting) {
      this.renderer.xr.getCamera().getWorldPosition(this.position);
    } else {
      this.sceneCamera.getWorldPosition(this.position);
    }

    const currentOpacity = this.material.opacity;
    if (currentOpacity !== this.targetAlpha) {
      const lerpFactor = this.timer.getDelta() / this.transitionTime;
      this.material.opacity =
          THREE.MathUtils.lerp(currentOpacity, this.targetAlpha, lerpFactor);
      if (Math.abs(this.material.opacity - this.targetAlpha) < 0.01) {
        this.material.opacity = this.targetAlpha;
      }
    }
  }

  dispose() {
    if (this.parent) {
      this.parent.remove(this);
    }
    this.material.dispose();
    this.geometry.dispose();
  }
}
