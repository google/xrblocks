import * as THREE from 'three';

import {AI} from '../../ai/AI';
import {AIOptions} from '../../ai/AIOptions';
import {getCameraParametersSnapshot} from '../../camera/CameraUtils';
import {XRDeviceCamera} from '../../camera/XRDeviceCamera';
import {Script} from '../../core/Script';
import {Depth} from '../../depth/Depth';
import {WorldOptions} from '../WorldOptions';
import {DetectedObject} from './DetectedObject';
import {
  BaseDetectorBackend,
  DetectorBackendContext,
} from './ObjectDetectorBackend';
import {GeminiDetectorBackend} from './backends/GeminiDetectorBackend';
import {MediaPipeDetectorBackend} from './backends/MediaPipeDetectorBackend';

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
  private _detectorBackends = new Map<
    string,
    Promise<BaseDetectorBackend<unknown>>
  >();

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

<<<<<<< HEAD
    const depthMeshSnapshot = this.getDepthMeshSnapshot();
    const cameraParametersSnapshot = getCameraParametersSnapshot(
      this.camera,
      this.renderer.xr.getCamera(),
      this.deviceCamera,
      this.targetDevice
    );

    const context = this.getDetectorContext();
    const activeBackend = this.options.objects.backendConfig.activeBackend;
    const detectorBackendPromise = this.getOrCreateDetectorBackend<T>(
      activeBackend,
      context
    );

    let detectorBackend: BaseDetectorBackend<T>;
    try {
      detectorBackend = await detectorBackendPromise;
    } catch (error) {
      console.warn(
        `Failed to load or initialize ObjectDetector backend '${activeBackend}':`,
        error
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
=======
    const context = this._getDetectorContext();
    let detector: BaseDetector<T>;

    switch (this.options.objects.backendConfig.activeBackend) {
      case 'gemini':
        detector = new GeminiDetector<T>(context);
        break;
      case 'mediapipe':
        detector = new MediaPipeDetector<T>(context);
        break;
      default:
        console.warn(
          `ObjectDetector backend '${this.options.objects.backendConfig.activeBackend
          }' is not supported.`
        );
        return [];
    }
    return detector.run();
  }

  private _getDetectorContext(): IDetectorContext {
>>>>>>> 5655435 (Refactored code to include GeminiDetector and MediaPipeDetector)
    return {
      options: this.options,
      ai: this.ai,
      aiOptions: this.aiOptions,
      deviceCamera: this.deviceCamera,
<<<<<<< HEAD
      debugVisualsGroup: this._debugVisualsGroup,
    };
  }

  private getOrCreateDetectorBackend<T>(
    activeBackend: string,
    context: DetectorBackendContext
  ): Promise<BaseDetectorBackend<T>> {
    let detectorBackendPromise = this._detectorBackends.get(activeBackend) as
      | Promise<BaseDetectorBackend<T>>
      | undefined;

    if (!detectorBackendPromise) {
      detectorBackendPromise = (async () => {
        switch (activeBackend) {
          case 'gemini':
            return new GeminiDetectorBackend(
              context
            ) as unknown as BaseDetectorBackend<T>;
          case 'mediapipe':
            return new MediaPipeDetectorBackend(
              context
            ) as unknown as BaseDetectorBackend<T>;
          default:
            throw new Error(
              `ObjectDetector backend '${activeBackend}' is not supported.`
            );
        }
      })();
      this._detectorBackends.set(
        activeBackend,
        detectorBackendPromise as Promise<BaseDetectorBackend<unknown>>
      );
    }
    return detectorBackendPromise;
=======
      depth: this.depth,
      camera: this.camera,
      renderer: this.renderer,
      targetDevice: this.targetDevice,
      detectedObjects: this._detectedObjects,
      debugVisualsGroup: this._debugVisualsGroup,
      add: (obj) => this.add(obj),
      getDepthMeshSnapshot: () => this.getDepthMeshSnapshot(),
      createDebugVisual: (obj) => this._createDebugVisual(obj),
    };
>>>>>>> 5655435 (Refactored code to include GeminiDetector and MediaPipeDetector)
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

<<<<<<< HEAD
=======
  // Removed simplifyDetections (moved to specialized classes)

  // Removed _runMediaPipeDetection (moved to MediaPipeDetector class)

  // Removed _runGeminiDetection (moved to GeminiDetector class)

>>>>>>> 5655435 (Refactored code to include GeminiDetector and MediaPipeDetector)
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
<<<<<<< HEAD
=======
   * Draws the detected bounding boxes on the input image and triggers a
   * download for debugging.
   * @param base64Image - The base64 encoded input image.
   * @param detections - The array of detected objects from the AI response.
   */
  // Removed _visualizeBoundingBoxesForMediaPipeOnImage

  /**
   * Draws the detected bounding boxes on the input image and triggers a
   * download for debugging.
   * @param base64Image - The base64 encoded input image.
   * @param detections - The array of detected objects from the AI response.
   */
  // Removed _visualizeBoundingBoxesOnImage

  /**
>>>>>>> 5655435 (Refactored code to include GeminiDetector and MediaPipeDetector)
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

// --- Specialized Detector Classes ---

interface SimplifiedDetection {
  ymin: number;
  xmin: number;
  ymax: number;
  xmax: number;
  objectName: string;
  additionalData?: any;
}

interface IDetectorContext {
  readonly options: WorldOptions;
  readonly ai: AI;
  readonly aiOptions: AIOptions;
  readonly deviceCamera: XRDeviceCamera;
  readonly depth: Depth;
  readonly camera: THREE.PerspectiveCamera;
  readonly renderer: THREE.WebGLRenderer;
  readonly targetDevice: string;
  readonly detectedObjects: Map<string, DetectedObject<any>>;
  readonly debugVisualsGroup?: THREE.Group;
  
  add(object: THREE.Object3D): void;
  getDepthMeshSnapshot(): THREE.Mesh;
  createDebugVisual(object: DetectedObject<unknown>): void;
}

abstract class BaseDetector<T> {
  constructor(protected context: IDetectorContext) {}

  async run(): Promise<DetectedObject<T>[]> {
    if (!this.isAvailable()) {
      return [];
    }

    const depthMeshSnapshot = this.context.getDepthMeshSnapshot();
    const cameraParametersSnapshot = getCameraParametersSnapshot(
      this.context.camera,
      this.context.renderer.xr.getCamera(),
      this.context.deviceCamera,
      this.context.targetDevice
    );

    const snapshot = await this.getSnapshot();
    if (!snapshot) return [];

    const rawDetections = await this.detect(snapshot);
    if (!rawDetections) return [];

    const simplifiedDetections = this.simplifyDetections(rawDetections, snapshot);

    if (this.context.options.objects.showDebugVisualizations) {
      this.visualize(snapshot, simplifiedDetections);
    }

    const detectionPromises = simplifiedDetections.map(async (item) => {
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
        const { worldPosition } = worldCoordinates;
        const margin = this.context.options.objects.objectImageMargin;

        const cropBox = boundingBox.clone();
        cropBox.min.subScalar(margin);
        cropBox.max.addScalar(margin);
        
        let objectImage: string;
        if (snapshot.imageData) {
          objectImage = await this._cropImageData(snapshot.imageData, cropBox);
        } else if (snapshot.base64) {
          objectImage = await cropImage(snapshot.base64, cropBox);
        } else {
          throw new Error('No valid snapshot data for cropping');
        }

        const object = new DetectedObject<T>(
          item.objectName,
          objectImage,
          boundingBox,
          item.additionalData as T
        );
        object.position.copy(worldPosition);

        this.context.add(object);
        this.context.detectedObjects.set(object.uuid, object);

        if (this.context.debugVisualsGroup) {
          this.context.createDebugVisual(object);
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

  protected abstract isAvailable(): boolean;
  protected abstract getSnapshot(): Promise<{ base64?: string; imageData?: ImageData } | null>;
  protected abstract detect(snapshot: { base64?: string; imageData?: ImageData }): Promise<any>;
  protected abstract simplifyDetections(raw: any, snapshot: { base64?: string; imageData?: ImageData }): SimplifiedDetection[];

  protected visualize(snapshot: { base64?: string; imageData?: ImageData }, detections: SimplifiedDetection[]) {
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

  private async _cropImageData(imageData: ImageData, boundingBox: THREE.Box2): Promise<string> {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d')!;

    const unitBox = new THREE.Box2(new THREE.Vector2(0, 0), new THREE.Vector2(1, 1));
    const clampedBox = boundingBox.clone().intersect(unitBox);
    const cropSize = new THREE.Vector2();
    clampedBox.getSize(cropSize);

    if (cropSize.x === 0 || cropSize.y === 0) {
        return 'data:image/png;base64,';
    }

    const sourceX = Math.floor(imageData.width * clampedBox.min.x);
    const sourceY = Math.floor(imageData.height * clampedBox.min.y);
    const sourceWidth = Math.ceil(imageData.width * cropSize.x);
    const sourceHeight = Math.ceil(imageData.height * cropSize.y);

    canvas.width = sourceWidth;
    canvas.height = sourceHeight;

    ctx.putImageData(imageData, -sourceX, -sourceY, sourceX, sourceY, sourceWidth, sourceHeight);

    return canvas.toDataURL('image/png');
  }
}

class MediaPipeDetector<T> extends BaseDetector<T> {
  protected isAvailable(): boolean {
    return true;
  }

  protected async getSnapshot(): Promise<{ imageData: ImageData } | null> {
    const imageData = await this.context.deviceCamera.getSnapshot({
      outputFormat: 'imageData',
    });
    if (!imageData) return null;
    return { imageData };
  }

  protected async detect(snapshot: { base64?: string; imageData?: ImageData }): Promise<any> {
    const vision = await MEDIAPIPE.FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
    );
    const objectDetector = await MEDIAPIPE.ObjectDetector.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: `https://storage.googleapis.com/mediapipe-tasks/object_detector/efficientdet_lite0_uint8.tflite`
      },
      scoreThreshold: 0.5,
    });
    if (!objectDetector) return null;
    return objectDetector.detect(snapshot.imageData!);
  }

  protected simplifyDetections(raw: any, snapshot: { base64?: string; imageData?: ImageData }): SimplifiedDetection[] {
    const response = raw as { detections: any[] };
    const width = snapshot.imageData!.width;
    const height = snapshot.imageData!.height;

    return response.detections.reduce<SimplifiedDetection[]>((acc: SimplifiedDetection[], detection: any) => {
      const box = detection.boundingBox;
      if (box) {
        const category = detection.categories?.[0];
        const objectName = category?.categoryName || category?.displayName || "unknown";
        acc.push({
          ymin: box.originY / height,
          xmin: box.originX / width,
          ymax: (box.originY + box.height) / height,
          xmax: (box.originX + box.width) / width,
          objectName: objectName
        });
      }
      return acc;
    }, []);
  }
}

class GeminiDetector<T> extends BaseDetector<T> {
  protected isAvailable(): boolean {
    return !!this.context.ai.isAvailable();
  }

  protected async getSnapshot(): Promise<{ base64: string } | null> {
    const base64Image = await this.context.deviceCamera.getSnapshot({
      outputFormat: 'base64',
    });
    if (!base64Image) return null;
    return { base64: base64Image };
  }

  protected async detect(snapshot: { base64?: string; imageData?: ImageData }): Promise<any> {
    const { mimeType, strippedBase64 } = parseBase64DataURL(snapshot.base64!);

    const geminiOptions = this.context.options.objects.backendConfig.gemini;
    const config = {
      thinkingConfig: { thinkingBudget: 0 },
      responseMimeType: 'application/json',
      responseSchema: geminiOptions.responseSchema,
      systemInstruction: [{ text: geminiOptions.systemInstruction }],
    };

    const originalGeminiConfig = this.context.aiOptions.gemini.config;
    this.context.aiOptions.gemini.config = config;
    const textPrompt = 'What do you see in this image?';

    try {
      const rawResponse = await (this.context.ai.model as Gemini).query({
        type: 'multiPart',
        parts: [
          { inlineData: { mimeType: mimeType || undefined, data: strippedBase64 } },
          { text: textPrompt },
        ],
      });
      return rawResponse;
    } finally {
      this.context.aiOptions.gemini.config = originalGeminiConfig;
    }
  }

  protected simplifyDetections(raw: any, snapshot: { base64?: string; imageData?: ImageData }): SimplifiedDetection[] {
    const rawResponse = raw;
    let parsedResponse;
    try {
      if (rawResponse && rawResponse.text) {
        parsedResponse = JSON.parse(rawResponse.text);
      } else {
        return [];
      }
    } catch (e) {
      return [];
    }

    if (!Array.isArray(parsedResponse)) return [];

    return parsedResponse.reduce<SimplifiedDetection[]>((acc, item) => {
      const { ymin, xmin, ymax, xmax, objectName, ...additionalData } = item || {};
      if ([ymin, xmin, ymax, xmax].every(coord => typeof coord === 'number')) {
        acc.push({
          ymin: ymin / 1000,
          xmin: xmin / 1000,
          ymax: ymax / 1000,
          xmax: xmax / 1000,
          objectName: objectName || "unknown",
          additionalData
        });
      }
      return acc;
    }, []);
  }
}
