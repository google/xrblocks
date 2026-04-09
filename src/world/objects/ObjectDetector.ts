import * as THREE from 'three';

import * as MEDIAPIPE from '@mediapipe/tasks-vision';

import { AI } from '../../ai/AI';
import { AIOptions } from '../../ai/AIOptions';
import { Gemini } from '../../ai/Gemini';
import {
  cropImage,
  getCameraParametersSnapshot,
  transformRgbUvToWorld,
} from '../../camera/CameraUtils';
import { XRDeviceCamera } from '../../camera/XRDeviceCamera';
import { Script } from '../../core/Script';
import { Depth } from '../../depth/Depth';
import { parseBase64DataURL } from '../../utils/utils';
import { WorldOptions } from '../WorldOptions';

import { DetectedObject } from './DetectedObject';

interface DetectedObjectBoundingBox {
  ymin: number;
  xmin: number;
  ymax: number;
  xmax: number;
  objectName: string;
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

  /**
   * The configuration for the Gemini backend.
   */
  private _geminiConfig!: object;

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
    this._geminiConfig = this._buildGeminiConfig();

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

    switch (this.options.objects.backendConfig.activeBackend) {
      case 'gemini':
        return this._runGeminiDetection<T>();
      case 'mediapipe':
        return this._runMediaPipeDetection<T>();
      default:
        console.warn(
          `ObjectDetector backend '${this.options.objects.backendConfig.activeBackend
          }' is not supported.`
        );
        return [];
    }
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

  private simplifyDetections(detections: MEDIAPIPE.Detection[] | null | undefined): DetectedObjectBoundingBox[] {
    // Return empty array if input is nullish
    if (!detections) return [];

    return detections.reduce<DetectedObjectBoundingBox[]>((acc, detection) => {
      // 1. Validate boundingBox exists
      const box = detection.boundingBox;

      if (box) {
        // 2. Extract name safely (default to "unknown")
        const category = detection.categories?.[0];
        const objectName = category?.categoryName || category?.displayName || "unknown";

        // 3. Map to your coordinate system
        acc.push({
          ymin: box.originY,
          xmin: box.originX,
          ymax: box.originY + box.height,
          xmax: box.originX + box.width,
          objectName: objectName
        });
      }

      return acc;
    }, []);
  }

  /**
   * Runs object detection using the MediaPipe backend.
   */
  private async _runMediaPipeDetection<T>(): Promise<DetectedObject<T>[]> {
    const vision = await MEDIAPIPE.FilesetResolver.forVisionTasks(
      "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm"
    );
    const objectDetector = await MEDIAPIPE.ObjectDetector.createFromOptions(vision, {
      baseOptions: {
        modelAssetPath: `https://storage.googleapis.com/mediapipe-tasks/object_detector/efficientdet_lite0_uint8.tflite`
      },
      scoreThreshold: 0.5,
    });
    if (!objectDetector) {
      console.error('Mediapipe is unavailable for object detection.');
      return [];
    }
    console.log("Mediapipe Object detector: " + objectDetector);

    // Cache depth and camera data to align with the captured image frame.
    const depthMeshSnapshot = this.getDepthMeshSnapshot();
    const cameraParametersSnapshot = getCameraParametersSnapshot(
      this.camera,
      this.renderer.xr.getCamera(),
      this.deviceCamera,
      this.targetDevice
    );

    const imageData = await this.deviceCamera.getSnapshot({
      outputFormat: 'imageData',
    });
    if (!imageData) {
      console.warn('Could not get device camera snapshot.');
      return [];
    }

    const base64Image = await this.deviceCamera.getSnapshot({
      outputFormat: 'base64',
    });
    if (!base64Image) {
      console.warn('Could not get device camera snapshot.');
      return [];
    }

    try {
      const detectorResponse = objectDetector.detect(imageData);
      console.log("HAHA Detections: " + JSON.stringify(detectorResponse, null, 2));

      if ('detections' in detectorResponse && !Array.isArray(detectorResponse['detections'])) {
        console.error('Parsed Mediapipe response is not an array:', detectorResponse);
        return [];
      }

      if (this.options.objects.showDebugVisualizations) {
        this._visualizeBoundingBoxesForMediaPipeOnImage(base64Image, detectorResponse.detections);
      }

      const detectionPromises = detectorResponse.detections.map(async (item) => {
        if (!item.boundingBox || !item.categories) {
          return null;
        }
        const category = item.categories?.[0];
        const objectName = category?.categoryName || category?.displayName || "unknown";


        const ymin = item.boundingBox.originY;
        const xmin = item.boundingBox.originX;
        const ymax = item.boundingBox.originY + item.boundingBox.height;
        const xmax = item.boundingBox.originX + item.boundingBox.width;

        // MediaPipe returns coordinates in pixels, convert to normalized 0-1.
        const boundingBox = new THREE.Box2(
          new THREE.Vector2(xmin / imageData.width, ymin / imageData.height),
          new THREE.Vector2(xmax / imageData.width, ymax / imageData.height)
        );

        console.log("THREE boundingBox" + JSON.stringify(boundingBox));

        const center = new THREE.Vector2();
        boundingBox.getCenter(center);

        const worldCoordinates = transformRgbUvToWorld(
          center,
          depthMeshSnapshot,
          cameraParametersSnapshot
        );

        if (worldCoordinates) {
          const { worldPosition } = worldCoordinates;
          const margin = this.options.objects.objectImageMargin;

          // Create a new bounding box for cropping that includes the margin.
          const cropBox = boundingBox.clone();
          cropBox.min.subScalar(margin);
          cropBox.max.addScalar(margin);
          const objectImage = await cropImage(base64Image, cropBox);

          const additionalData = "Unknown";
          const object = new DetectedObject<T>(
            objectName,
            objectImage,
            boundingBox,
            additionalData as T
          );
          object.position.copy(worldPosition);

          this.add(object);
          this._detectedObjects.set(object.uuid, object);

          if (this._debugVisualsGroup) {
            this._createDebugVisual(object);
          }
          return object;
        }
      });

      const detectedObjects = (await Promise.all(detectionPromises)).filter(
        (obj): obj is DetectedObject<T> => obj !== null && obj !== undefined
      );
      return detectedObjects;
    } catch (error) {
      console.error('Mediapipe query for object detection failed:', error);
      return [];
    }
  }

  /**
   * Runs object detection using the Gemini backend.
   */
  private async _runGeminiDetection<T>(): Promise<DetectedObject<T>[]> {
    if (!this.ai.isAvailable()) {
      console.error('Gemini is unavailable for object detection.');
      return [];
    }

    // Cache depth and camera data to align with the captured image frame.
    const depthMeshSnapshot = this.getDepthMeshSnapshot();
    const cameraParametersSnapshot = getCameraParametersSnapshot(
      this.camera,
      this.renderer.xr.getCamera(),
      this.deviceCamera,
      this.targetDevice
    );

    const base64Image = await this.deviceCamera.getSnapshot({
      outputFormat: 'base64',
    });
    if (!base64Image) {
      console.warn('Could not get device camera snapshot.');
      return [];
    }

    const { mimeType, strippedBase64 } = parseBase64DataURL(base64Image);

    // Temporarily set the Gemini config for this specific query type.
    const originalGeminiConfig = this.aiOptions.gemini.config;
    this.aiOptions.gemini.config = this._geminiConfig;
    const textPrompt = 'What do you see in this image?';

    try {
      const rawResponse = await (this.ai.model as Gemini).query({
        type: 'multiPart',
        parts: [
          { inlineData: { mimeType: mimeType || undefined, data: strippedBase64 } },
          { text: textPrompt },
        ],
      });

      let parsedResponse;
      try {
        if (rawResponse && rawResponse.text) {
          parsedResponse = JSON.parse(rawResponse.text);
        } else {
          console.error(
            'AI response is missing text field:',
            rawResponse,
            'Raw response was:',
            rawResponse
          );
          return [];
        }
      } catch (e) {
        console.error(
          'Failed to parse AI response JSON:',
          e,
          'Raw response was:',
          rawResponse
        );
        return [];
      }

      if (!Array.isArray(parsedResponse)) {
        console.error('Parsed AI response is not an array:', parsedResponse);
        return [];
      }

      if (this.options.objects.showDebugVisualizations) {
        this._visualizeBoundingBoxesOnImage(base64Image, parsedResponse);
      }

      const detectionPromises = parsedResponse.map(async (item) => {
        const { ymin, xmin, ymax, xmax, objectName, ...additionalData } =
          item || {};
        if (
          [ymin, xmin, ymax, xmax].some((coord) => typeof coord !== 'number')
        ) {
          return null;
        }

        // Bounding box from AI is 0-1000, convert to normalized 0-1.
        const boundingBox = new THREE.Box2(
          new THREE.Vector2(xmin / 1000, ymin / 1000),
          new THREE.Vector2(xmax / 1000, ymax / 1000)
        );
        console.log("Object: " + objectName);
        console.log("THREE boundingBox" + JSON.stringify(boundingBox));

        const center = new THREE.Vector2();
        boundingBox.getCenter(center);

        const worldCoordinates = transformRgbUvToWorld(
          center,
          depthMeshSnapshot,
          cameraParametersSnapshot
        );

        if (worldCoordinates) {
          const { worldPosition } = worldCoordinates;
          const margin = this.options.objects.objectImageMargin;

          // Create a new bounding box for cropping that includes the margin.
          const cropBox = boundingBox.clone();
          cropBox.min.subScalar(margin);
          cropBox.max.addScalar(margin);
          const objectImage = await cropImage(base64Image, cropBox);

          const object = new DetectedObject<T>(
            objectName,
            objectImage,
            boundingBox,
            additionalData as T
          );
          object.position.copy(worldPosition);

          this.add(object);
          this._detectedObjects.set(object.uuid, object);

          if (this._debugVisualsGroup) {
            this._createDebugVisual(object);
          }
          return object;
        }
      });

      const detectedObjects = (await Promise.all(detectionPromises)).filter(
        (obj): obj is DetectedObject<T> => obj !== null && obj !== undefined
      );
      return detectedObjects;
    } catch (error) {
      console.error('AI query for object detection failed:', error);
      return [];
    } finally {
      // Restore the original config after the query.
      this.aiOptions.gemini.config = originalGeminiConfig;
    }
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
   * Draws the detected bounding boxes on the input image and triggers a
   * download for debugging.
   * @param base64Image - The base64 encoded input image.
   * @param detections - The array of detected objects from the AI response.
   */
  private _visualizeBoundingBoxesForMediaPipeOnImage(
    base64Image: string,
    detections: MEDIAPIPE.Detection[]
  ) {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;

      ctx.drawImage(img, 0, 0);

      detections.forEach((item) => {
        if (!item.boundingBox || !item.categories) {
          return null;
        }
        const category = item.categories?.[0];
        const objectName = category?.categoryName || category?.displayName || "unknown";


        const ymin = item.boundingBox.originY;
        const xmin = item.boundingBox.originX;
        const ymax = item.boundingBox.originY + item.boundingBox.height;
        const xmax = item.boundingBox.originX + item.boundingBox.width;

        // MediaPipe returns coordinates in pixels.
        const rectX = xmin;
        const rectY = ymin;
        const rectWidth = xmax - xmin;
        const rectHeight = ymax - ymin;

        ctx.strokeStyle = '#FF0000';
        ctx.lineWidth = Math.max(2, canvas.width / 400);
        ctx.strokeRect(rectX, rectY, rectWidth, rectHeight);

        // Draw label.
        const text = objectName || 'unknown';
        const fontSize = Math.max(16, canvas.width / 80);
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.textBaseline = 'bottom';
        const textMetrics = ctx.measureText(text);

        // Draw a background for the text for better readability.
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(
          rectX,
          rectY - fontSize,
          textMetrics.width + 8,
          fontSize + 4
        );

        // Draw the text itself.
        ctx.fillStyle = '#FFFFFF'; // White text
        ctx.fillText(text, rectX + 4, rectY + 2);
      });

      // Create a link and trigger the download.
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
    img.src = base64Image;
  }

  /**
   * Draws the detected bounding boxes on the input image and triggers a
   * download for debugging.
   * @param base64Image - The base64 encoded input image.
   * @param detections - The array of detected objects from the AI response.
   */
  private _visualizeBoundingBoxesOnImage(
    base64Image: string,
    detections: object[]
  ) {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;

      ctx.drawImage(img, 0, 0);

      detections.forEach((item) => {
        const { ymin, xmin, ymax, xmax, objectName } = (item || {}) as {
          ymin?: number;
          xmin?: number;
          ymax?: number;
          xmax?: number;
          objectName?: string;
        };
        if (
          [ymin, xmin, ymax, xmax].some((coord) => typeof coord !== 'number')
        ) {
          return;
        }

        // Bounding box from AI is 0-1000, scale it to image dimensions.
        const rectX = (xmin! / 1000) * canvas.width;
        const rectY = (ymin! / 1000) * canvas.height;
        const rectWidth = ((xmax! - xmin!) / 1000) * canvas.width;
        const rectHeight = ((ymax! - ymin!) / 1000) * canvas.height;

        ctx.strokeStyle = '#FF0000';
        ctx.lineWidth = Math.max(2, canvas.width / 400);
        ctx.strokeRect(rectX, rectY, rectWidth, rectHeight);

        // Draw label.
        const text = objectName || 'unknown';
        const fontSize = Math.max(16, canvas.width / 80);
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.textBaseline = 'bottom';
        const textMetrics = ctx.measureText(text);

        // Draw a background for the text for better readability.
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(
          rectX,
          rectY - fontSize,
          textMetrics.width + 8,
          fontSize + 4
        );

        // Draw the text itself.
        ctx.fillStyle = '#FFFFFF'; // White text
        ctx.fillText(text, rectX + 4, rectY + 2);
      });

      // Create a link and trigger the download.
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
    img.src = base64Image;
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

  /**
   * Creates a simple debug visualization for an object based on its position
   * (center of its 2D detection bounding box).
   * @param object - The detected object to visualize.
   */
  private async _createDebugVisual(object: DetectedObject<unknown>) {
    // Create sphere.
    const sphere = new THREE.Mesh(
      new THREE.SphereGeometry(0.03, 16, 16),
      new THREE.MeshBasicMaterial({ color: 0xff4285f4 })
    );
    sphere.position.copy(object.position);

    // Create and configure the text label using Troika.
    const { Text } = await import('troika-three-text');
    const textLabel = new Text();
    textLabel.text = object.label;
    textLabel.fontSize = 0.07;
    textLabel.color = 0xffffff;
    textLabel.anchorX = 'center';
    textLabel.anchorY = 'bottom';

    // Position the label above the sphere
    textLabel.position.copy(sphere.position);
    textLabel.position.y += 0.04; // Offset above the sphere.

    this._debugVisualsGroup!.add(sphere, textLabel);
    textLabel.sync(); // Required for Troika text to appear.
  }

  /**
   * Builds the Gemini configuration object from the world options.
   */
  private _buildGeminiConfig() {
    const geminiOptions = this.options.objects.backendConfig.gemini;
    return {
      thinkingConfig: {
        thinkingBudget: 0,
      },
      responseMimeType: 'application/json',
      responseSchema: geminiOptions.responseSchema,
      systemInstruction: [{ text: geminiOptions.systemInstruction }],
    };
  }
}
