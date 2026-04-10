import * as THREE from 'three';
import * as MEDIAPIPE from '@mediapipe/tasks-vision';

import {AI} from '../../ai/AI';
import {AIOptions} from '../../ai/AIOptions';
import {Gemini} from '../../ai/Gemini';
import {GeminiResponse} from '../../ai/AITypes';
import {
  CameraParametersSnapshot,
  cropImage,
  cropImageData,
  transformRgbUvToWorld,
} from '../../camera/CameraUtils';
import {XRDeviceCamera} from '../../camera/XRDeviceCamera';
import {parseBase64DataURL} from '../../utils/utils';
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

    const normalizedDetections = await this.detect(snapshot);

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

        let objectImage: string;
        if (snapshot.imageData) {
          objectImage = await cropImageData(snapshot.imageData, cropBox);
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
 * Object detector backend implementation using MediaPipe's Object Detector.
 * Runs locally on the device.
 *
 * T - The type of additional data associated with the detected object (not used currently).
 */
export class MediaPipeDetectorBackend<T> extends BaseDetectorBackend<T> {
  protected isAvailable(): boolean {
    return true;
  }

  protected async getSnapshot(): Promise<{imageData: ImageData} | null> {
    const imageData = await this.context.deviceCamera.getSnapshot({
      outputFormat: 'imageData',
    });
    if (!imageData) return null;
    return {imageData};
  }

  protected async detect(
    snapshot: CameraSnapshot
  ): Promise<NormalizedDetectedObject<T>[]> {
    const mediapipeOptions =
      this.context.options.objects.backendConfig.mediapipe;
    const vision = await MEDIAPIPE.FilesetResolver.forVisionTasks(
      mediapipeOptions.wasmFilesUrl
    );
    const objectDetector = await MEDIAPIPE.ObjectDetector.createFromOptions(
      vision,
      {
        baseOptions: {
          modelAssetPath: mediapipeOptions.modelAssetPath,
        },
        scoreThreshold: mediapipeOptions.scoreThreshold,
      }
    );
    if (!objectDetector) return [];

    const backendResponse = objectDetector.detect(snapshot.imageData!);
    if (!backendResponse) return [];

    const width = snapshot.imageData!.width;
    const height = snapshot.imageData!.height;

    return this.normalizeDetections(backendResponse, width, height);
  }

  private normalizeDetections(
    backendResponse: MEDIAPIPE.ObjectDetectorResult,
    width: number,
    height: number
  ): NormalizedDetectedObject<T>[] {
    // Map MediaPipe detections to NormalizedDetectedObject format.
    // We normalize the bounding box coordinates by the image dimensions.
    return backendResponse.detections.reduce<NormalizedDetectedObject<T>[]>(
      (acc: NormalizedDetectedObject<T>[], detection: MEDIAPIPE.Detection) => {
        const box = detection.boundingBox;
        if (box) {
          const category = detection.categories?.[0];
          const objectName =
            category?.categoryName || category?.displayName || 'unknown';
          acc.push({
            ymin: box.originY / height,
            xmin: box.originX / width,
            ymax: (box.originY + box.height) / height,
            xmax: (box.originX + box.width) / width,
            objectName: objectName,
          });
        }
        return acc;
      },
      []
    );
  }
}

/**
 * Object detector backend implementation using Gemini via the AI service.
 * Sends image data to a remote model for detection.
 *
 * T - The type of additional data associated with the detected object.
 */
export class GeminiDetectorBackend<T> extends BaseDetectorBackend<T> {
  protected isAvailable(): boolean {
    return !!this.context.ai.isAvailable();
  }

  protected async getSnapshot(): Promise<{base64: string} | null> {
    const base64Image = await this.context.deviceCamera.getSnapshot({
      outputFormat: 'base64',
    });
    if (!base64Image) return null;
    return {base64: base64Image};
  }

  private buildGeminiConfig() {
    const geminiOptions = this.context.options.objects.backendConfig.gemini;
    return {
      thinkingConfig: {
        thinkingBudget: 0,
      },
      responseMimeType: 'application/json',
      responseSchema: geminiOptions.responseSchema,
      systemInstruction: [{text: geminiOptions.systemInstruction}],
    };
  }

  protected async detect(
    snapshot: CameraSnapshot
  ): Promise<NormalizedDetectedObject<T>[]> {
    const {mimeType, strippedBase64} = parseBase64DataURL(snapshot.base64!);

    const config = this.buildGeminiConfig();

    const originalGeminiConfig = this.context.aiOptions.gemini.config;
    this.context.aiOptions.gemini.config = config;
    const textPrompt = 'What do you see in this image?';

    let backendResponse: GeminiResponse | null = null;
    try {
      backendResponse = await (this.context.ai.model as Gemini).query({
        type: 'multiPart',
        parts: [
          {inlineData: {mimeType: mimeType || undefined, data: strippedBase64}},
          {text: textPrompt},
        ],
      });
    } catch (e) {
      console.error('Gemini detection failed', e);
      return [];
    } finally {
      this.context.aiOptions.gemini.config = originalGeminiConfig;
    }

    return this.normalizeDetections(backendResponse);
  }

  private normalizeDetections(
    backendResponse: GeminiResponse | null
  ): NormalizedDetectedObject<T>[] {
    let parsedResponse;
    try {
      if (backendResponse && backendResponse.text) {
        parsedResponse = JSON.parse(backendResponse.text);
      } else {
        return [];
      }
    } catch (e) {
      console.warn('Error while normalizing detections in Gemini Response', e);
      return [];
    }

    if (!Array.isArray(parsedResponse)) return [];

    // Map Gemini JSON response to NormalizedDetectedObject format.
    // Gemini returns coordinates in the range [0, 1000], so we divide by 1000 to normalize.
    return parsedResponse.reduce<NormalizedDetectedObject<T>[]>((acc, item) => {
      const {ymin, xmin, ymax, xmax, objectName, ...additionalData} =
        item || {};
      if (
        [ymin, xmin, ymax, xmax].every((coord) => typeof coord === 'number')
      ) {
        acc.push({
          ymin: ymin / 1000,
          xmin: xmin / 1000,
          ymax: ymax / 1000,
          xmax: xmax / 1000,
          objectName: objectName || 'unknown',
          additionalData: additionalData as T,
        });
      }
      return acc;
    }, []);
  }
}
