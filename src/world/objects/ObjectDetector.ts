import * as THREE from 'three';

import {AI} from '../../ai/AI';
import {AIOptions} from '../../ai/AIOptions';
import {
  CameraParametersSnapshot,
  cropImage,
  getCameraParametersSnapshot,
  transformRgbUvToWorld,
} from '../../camera/CameraUtils';
import {XRDeviceCamera} from '../../camera/XRDeviceCamera';
import {Script} from '../../core/Script';
import {Depth} from '../../depth/Depth';
import {WorldOptions} from '../WorldOptions';

import {DetectedObject} from './DetectedObject';

/**
 * Represents a detected object in a normalized format, independent of the specific detector backend used.
 * Coordinates are normalized typically in the range [0, 1].
 *
 * T - The type of additional data associated with the detected object.
 */
export interface NormalizedDetectedObject<T> {
  ymin: number;
  xmin: number;
  ymax: number;
  xmax: number;
  objectName: string;
  additionalData?: T;
}

/**
 * Represents a snapshot taken from the device camera.
 * Can contain either a base64 encoded image string or raw ImageData.
 */
export interface CameraSnapshot {
  base64?: string;
  imageData?: ImageData;
}

/**
 * The context required by detector backends to operate.
 * Provides access to options, AI services, camera, and debug visualization groups.
 */
export interface DetectorBackendContext {
  readonly options: WorldOptions;
  readonly ai: AI;
  readonly aiOptions: AIOptions;
  readonly deviceCamera: XRDeviceCamera;
  readonly debugVisualsGroup?: THREE.Group;
}

/**
 * Base class for object detector backends.
 * Handles the orchestration of capturing snapshots, running detection,
 * and creating visual representations.
 *
 * T - The type of additional data associated with the detected object.
 */
export abstract class BaseDetectorBackend<T> {
  constructor(protected context: DetectorBackendContext) {}

  async run(
    depthMeshSnapshot: THREE.Mesh,
    cameraParametersSnapshot: CameraParametersSnapshot
  ): Promise<DetectedObject<T>[]> {
    if (!this.isAvailable()) {
      return [];
    }

    const snapshot = await this.getSnapshot();
    if (!snapshot) return [];

    let normalizedDetections: NormalizedDetectedObject<T>[] = [];
    try {
      normalizedDetections = await this.detect(snapshot);
    } catch (error) {
      console.error('Object detection backend failed:', error);
      return [];
    }

    if (this.context.options.objects.showDebugVisualizations) {
      this.visualize(snapshot, normalizedDetections);
    }

    const detectionPromises = normalizedDetections.map(async (item) => {
      const boundingBox = new THREE.Box2(
        new THREE.Vector2(item.xmin, item.ymin),
        new THREE.Vector2(item.xmax, item.ymax)
      );

      const center = new THREE.Vector2();
      boundingBox.getCenter(center);

      const worldCoordinates = transformRgbUvToWorld(
        center,
        depthMeshSnapshot,
        cameraParametersSnapshot
      );

      if (worldCoordinates) {
        const {worldPosition} = worldCoordinates;
        const margin = this.context.options.objects.objectImageMargin;

        const cropBox = boundingBox.clone();
        cropBox.min.subScalar(margin);
        cropBox.max.addScalar(margin);

        const imageSource = snapshot.imageData || snapshot.base64;
        if (!imageSource) {
          throw new Error('No valid snapshot data for cropping');
        }
        const objectImage = await cropImage(imageSource, cropBox);

        const object = new DetectedObject<T>(
          item.objectName,
          objectImage,
          boundingBox,
          item.additionalData as T
        );
        object.position.copy(worldPosition);

        if (this.context.debugVisualsGroup) {
          this.createDebugVisual(object);
        }
        return object;
      }
      return null;
    });

    const detectedObjects = (await Promise.all(detectionPromises)).filter(
      (obj): obj is DetectedObject<T> => obj !== null && obj !== undefined
    );
    return detectedObjects;
  }

  /**
   * Checks if the detector backend is available for use.
   * @returns true if the backend is available, false otherwise.
   */
  protected abstract isAvailable(): boolean;

  /**
   * Captures a snapshot from the device camera.
   * @returns A promise that resolves to an object containing base64 or imageData of the snapshot, or null if capture fails.
   */
  protected abstract getSnapshot(): Promise<CameraSnapshot | null>;

  /**
   * Runs the object detection algorithm on the provided snapshot and returns normalized detections.
   * @param snapshot - The snapshot containing base64 or imageData.
   * @returns A promise that resolves to an array of normalized detected objects.
   */
  protected abstract detect(
    snapshot: CameraSnapshot
  ): Promise<NormalizedDetectedObject<T>[]>;

  /**
   * Creates a debug visual representation for a detected object in the 3D scene.
   *
   * @param object - The detected object to visualize.
   */
  protected async createDebugVisual(object: DetectedObject<T>) {
    // Create sphere.
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.03, 16, 16),
      new THREE.MeshBasicMaterial({color: 0xff4285f4})
    );
    sphere.position.copy(object.position);

    // Create and configure the text label using Troika.
    const {Text} = await import('troika-three-text');
    const textLabel = new Text();
    textLabel.text = object.label;
    textLabel.fontSize = 0.07;
    textLabel.color = 0xffffff;
    textLabel.anchorX = 'center';
    textLabel.anchorY = 'bottom';

    // Position the label above the sphere
    textLabel.position.copy(sphere.position);
    textLabel.position.y += 0.04; // Offset above the sphere.

    this.context.debugVisualsGroup!.add(sphere, textLabel);
    textLabel.sync(); // Required for Troika text to appear.
  }

  /**
   * Visualizes the detections by drawing bounding boxes on a canvas and downloading the image.
   * This is used for debugging detection results.
   *
   * @param snapshot - The camera snapshot used for detection.
   * @param detections - The array of normalized detections to draw.
   */
  protected visualize(
    snapshot: CameraSnapshot,
    detections: NormalizedDetectedObject<T>[]
  ) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;

    const drawDetectionsAndDownload = () => {
      detections.forEach((item) => {
        const rectX = item.xmin * canvas.width;
        const rectY = item.ymin * canvas.height;
        const rectWidth = (item.xmax - item.xmin) * canvas.width;
        const rectHeight = (item.ymax - item.ymin) * canvas.height;

        ctx.strokeStyle = '#FF0000';
        ctx.lineWidth = Math.max(2, canvas.width / 400);
        ctx.strokeRect(rectX, rectY, rectWidth, rectHeight);

        const text = item.objectName;
        const fontSize = Math.max(16, canvas.width / 80);
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.textBaseline = 'bottom';
        const textMetrics = ctx.measureText(text);

        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(
          rectX,
          rectY - fontSize,
          textMetrics.width + 8,
          fontSize + 4
        );

        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(text, rectX + 4, rectY + 2);
      });

      const timestamp = new Date()
        .toISOString()
        .slice(0, 19)
        .replace('T', '_')
        .replace(/:/g, '-');
      const link = document.createElement('a');
      link.download = `detection_debug_${timestamp}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    };

    if (snapshot.imageData) {
      canvas.width = snapshot.imageData.width;
      canvas.height = snapshot.imageData.height;
      ctx.putImageData(snapshot.imageData, 0, 0);
      drawDetectionsAndDownload();
    } else if (snapshot.base64) {
      const img = new Image();
      img.onload = () => {
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        ctx.drawImage(img, 0, 0);
        drawDetectionsAndDownload();
      };
      img.src = snapshot.base64;
    }
  }
}

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
      this._debugVisualsGroup.raycast = () => {};
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

    const depthMeshSnapshot = this.getDepthMeshSnapshot();
    const cameraParametersSnapshot = getCameraParametersSnapshot(
      this.camera,
      this.renderer.xr.getCamera(),
      this.deviceCamera,
      this.targetDevice
    );

    const context = this.getDetectorContext();
    let detectorBackend: BaseDetectorBackend<T>;

    switch (this.options.objects.backendConfig.activeBackend) {
      case 'gemini': {
        const {GeminiDetectorBackend} = await import(
          './backends/GeminiDetectorBackend'
        );
        detectorBackend = new GeminiDetectorBackend<T>(context);
        break;
      }
      case 'mediapipe': {
        const {MediaPipeDetectorBackend} = await import(
          './backends/MediaPipeDetectorBackend'
        );
        detectorBackend = new MediaPipeDetectorBackend<T>(context);
        break;
      }
      default:
        console.warn(
          `ObjectDetector backend '${
            this.options.objects.backendConfig.activeBackend
          }' is not supported.`
        );
        return [];
    }
    const detectedObjects = await detectorBackend.run(
      depthMeshSnapshot,
      cameraParametersSnapshot
    );
    for (const obj of detectedObjects) {
      this._detectedObjects.set(obj.uuid, obj);
      this.add(obj);
    }
    return detectedObjects;
  }

  private getDetectorContext(): DetectorBackendContext {
    return {
      options: this.options,
      ai: this.ai,
      aiOptions: this.aiOptions,
      deviceCamera: this.deviceCamera,
      debugVisualsGroup: this._debugVisualsGroup,
    };
  }

  private getDepthMeshSnapshot() {
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
