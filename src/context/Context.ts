import * as THREE from 'three';

import {Script} from '../core/Script';
import {ScreenshotSynthesizer} from '../core/components/ScreenshotSynthesizer';
import {XRDeviceCamera} from '../camera/XRDeviceCamera';

import {ContextOptions} from './ContextOptions';
import {SceneDetector} from './scene/SceneDetector';

export class Context extends Script {
  static dependencies = {
    options: ContextOptions,
    scene: THREE.Scene,
    camera: THREE.Camera,
    screenshotSynthesizer: ScreenshotSynthesizer,
  };

  editorIcon = 'account_tree';

  /**
   * Configuration options for all context-sensing features.
   */
  options!: ContextOptions;

  /**
   * The scene context module instance. Null if not enabled.
   */
  scene?: SceneDetector;

  private deviceCamera?: XRDeviceCamera;

  override init({
    options,
    deviceCamera,
  }: {
    options: ContextOptions;
    scene: THREE.Scene;
    camera: THREE.Camera;
    screenshotSynthesizer: ScreenshotSynthesizer;
    deviceCamera?: XRDeviceCamera;
  }) {
    this.options = options;
    this.removeDetectors();
    this.deviceCamera = deviceCamera ?? this.deviceCamera;

    if (!options.enabled) {
      return;
    }

    if (options.scene.enabled) {
      this.scene = new SceneDetector();
      this.scene.setDeviceCamera(this.deviceCamera);
      this.add(this.scene);
    }
  }

  setDeviceCamera(deviceCamera: XRDeviceCamera | undefined) {
    this.deviceCamera = deviceCamera;
    this.scene?.setDeviceCamera(deviceCamera);
  }

  override dispose() {
    this.removeDetectors();
  }

  private removeDetectors() {
    if (this.scene) {
      this.scene.dispose();
      this.remove(this.scene);
    }
    this.scene = undefined;
  }
}
