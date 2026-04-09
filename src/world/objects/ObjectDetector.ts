import * as THREE from 'three';

import { AI } from '../../ai/AI';
import { AIOptions } from '../../ai/AIOptions';
import { getCameraParametersSnapshot } from '../../camera/CameraUtils';
import { XRDeviceCamera } from '../../camera/XRDeviceCamera';
import { Script } from '../../core/Script';
import { Depth } from '../../depth/Depth';
import { WorldOptions } from '../WorldOptions';

import { DetectedObject } from './DetectedObject';
import {
  BaseDetectorBackend,
  GeminiDetectorBackend,
  MediaPipeDetectorBackend,
  IDetectorContext,
} from './ObjectDetectorBackend';

/**
 * Detects objects in the user's environment using a specified backend.
 * It queries an AI model with the device camera feed and returns located
 * objects with 2D and 3D positioning data.
 */
export class ObjectDetector extends Script {
  static dependencies = {
    options: WorldOptions,
    ai: AI,
    aiOptions: AIOptions,
    deviceCamera: XRDeviceCamera,
    depth: Depth,
    camera: THREE.Camera,
    renderer: THREE.WebGLRenderer,
  };

  /**
   * A map from the object's UUID to our custom `DetectedObject` instance.
   */
  private _detectedObjects = new Map<string, DetectedObject<unknown>>();

  private _debugVisualsGroup?: THREE.Group;


  // Injected dependencies
  private options!: WorldOptions;
  private ai!: AI;
  private aiOptions!: AIOptions;
  private deviceCamera!: XRDeviceCamera;
  private depth!: Depth;
  private camera!: THREE.PerspectiveCamera;
  private renderer!: THREE.WebGLRenderer;

  targetDevice = 'galaxyxr';

  /**
   * Initializes the ObjectDetector.
   * @override
   */
  init({
    options,
    ai,
    aiOptions,
    deviceCamera,
    depth,
    camera,
    renderer,
  }: {
    options: WorldOptions;
    ai: AI;
    aiOptions: AIOptions;
    deviceCamera: XRDeviceCamera;
    depth: Depth;
    camera: THREE.PerspectiveCamera;
    renderer: THREE.WebGLRenderer;
  }) {
    this.options = options;
    this.ai = ai;
    this.aiOptions = aiOptions;
    this.deviceCamera = deviceCamera;
    this.depth = depth;
    this.camera = camera;
    this.renderer = renderer;

    if (this.options.objects.showDebugVisualizations) {
      this._debugVisualsGroup = new THREE.Group();
      // Disable raycasting for the debug group to prevent interaction errors.
      this._debugVisualsGroup.raycast = () => { };
      this.add(this._debugVisualsGroup);
    }
  }

  /**
   * Runs the object detection process based on the configured backend.
   * @returns A promise that resolves with an
   * array of detected `DetectedObject` instances.
   */
  async runDetection<T = null>(): Promise<DetectedObject<T>[]> {
    this.clear(); // Clear previous results before starting a new detection.

    const depthMeshSnapshot = this._getDepthMeshSnapshot();
    const cameraParametersSnapshot = getCameraParametersSnapshot(
      this.camera,
      this.renderer.xr.getCamera(),
      this.deviceCamera,
      this.targetDevice
    );

    const context = this._getDetectorContext();
    let detectorBackend: BaseDetectorBackend<T>;

    switch (this.options.objects.backendConfig.activeBackend) {
      case 'gemini':
        detectorBackend = new GeminiDetectorBackend<T>(context);
        break;
      case 'mediapipe':
        detectorBackend = new MediaPipeDetectorBackend<T>(context);
        break;
      default:
        console.warn(
          `ObjectDetector backend '${this.options.objects.backendConfig.activeBackend
          }' is not supported.`
        );
        return [];
    }
    const detectedObjects = await detectorBackend.run(depthMeshSnapshot, cameraParametersSnapshot);
    for (const obj of detectedObjects) {
      this._detectedObjects.set(obj.uuid, obj);
      this.add(obj);
    }
    return detectedObjects;
  }

  private _getDetectorContext(): IDetectorContext {
    return {
      options: this.options,
      ai: this.ai,
      aiOptions: this.aiOptions,
      deviceCamera: this.deviceCamera,
      debugVisualsGroup: this._debugVisualsGroup,
    };
  }

  private _getDepthMeshSnapshot() {
    const clonedGeometry = this.depth.depthMesh!.geometry.clone();
    clonedGeometry.computeBoundingSphere();
    clonedGeometry.computeBoundingBox();
    const depthMeshSnapshot = new THREE.Mesh(
      clonedGeometry,
      new THREE.MeshBasicMaterial()
    );
    this.depth.depthMesh!.getWorldPosition(depthMeshSnapshot.position);
    this.depth.depthMesh!.getWorldQuaternion(depthMeshSnapshot.quaternion);
    this.depth.depthMesh!.getWorldScale(depthMeshSnapshot.scale);
    depthMeshSnapshot.updateMatrixWorld(true);
    return depthMeshSnapshot;
  }

  /**
   * Retrieves a list of currently detected objects.
   *
   * @param label - The semantic label to filter by (e.g., 'chair'). If null,
   * all objects are returned.
   * @returns An array of `Object` instances.
   */
  get<T = null>(label = null): DetectedObject<T>[] {
    const allObjects = Array.from(this._detectedObjects.values());
    if (!label) {
      return allObjects as DetectedObject<T>[];
    }
    return allObjects.filter(
      (obj) => obj.label === label
    ) as DetectedObject<T>[];
  }

  /**
   * Removes all currently detected objects from the scene and internal
   * tracking.
   */
  clear() {
    for (const obj of this._detectedObjects.values()) {
      this.remove(obj);
    }
    this._detectedObjects.clear();
    if (this._debugVisualsGroup) {
      this._debugVisualsGroup.clear();
    }
    return this;
  }

  /**
   * Toggles the visibility of all debug visualizations for detected objects.
   * @param visible - Whether the visualizations should be visible.
   */
  showDebugVisualizations(visible = true) {
    if (this._debugVisualsGroup) {
      this._debugVisualsGroup.visible = visible;
    }
  }

  /**
   * Generates a visual representation of the depth map, normalized to 0-1 range,
   * and triggers a download for debugging.
   * @param depthArray - The raw depth data array.
   */
  private _visualizeDepthMap(depthArray: Float32Array | Uint16Array) {
    const width = this.depth.width;
    const height = this.depth.height;

    if (!width || !height || depthArray.length === 0) {
      console.warn('Cannot visualize depth map: missing dimensions or data.');
      return;
    }

    // 1. Find Min/Max for normalization (ignoring 0/invalid depth).
    let min = Infinity;
    let max = -Infinity;

    for (let i = 0; i < depthArray.length; ++i) {
      const val = depthArray[i];
      if (val > 0) {
        if (val < min) min = val;
        if (val > max) max = val;
      }
    }

    // Handle edge case where no valid depth exists.
    if (min === Infinity) {
      min = 0;
      max = 1;
    }
    if (min === max) {
      max = min + 1; // Avoid divide by zero
    }

    // 2. Create Canvas.
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d')!;
    const imageData = ctx.createImageData(width, height);
    const data = imageData.data;

    // 3. Fill Pixels.
    for (let i = 0; i < depthArray.length; ++i) {
      const raw = depthArray[i];
      // Normalize to 0-1.
      // Typically 0 means invalid/sky in some depth APIs, so we keep it black.
      // Otherwise, map [min, max] to [0, 1].
      const normalized = raw === 0 ? 0 : (raw - min) / (max - min);
      const byteVal = Math.floor(normalized * 255);

      const stride = i * 4;
      data[stride] = byteVal; // R
      data[stride + 1] = byteVal; // G
      data[stride + 2] = byteVal; // B
      data[stride + 3] = 255; // Alpha
    }

    ctx.putImageData(imageData, 0, 0);

    // 4. Download.
    const timestamp = new Date()
      .toISOString()
      .slice(0, 19)
      .replace('T', '_')
      .replace(/:/g, '-');
    const link = document.createElement('a');
    link.download = `depth_debug_${timestamp}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  }


}


