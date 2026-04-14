import * as THREE from 'three';
import {AI} from '../../ai/AI';
import {AIOptions} from '../../ai/AIOptions';
import {
  CameraParametersSnapshot,
  cropImage,
  transformRgbUvToWorld,
} from '../../camera/CameraUtils';
import {XRDeviceCamera} from '../../camera/XRDeviceCamera';
import {WorldOptions} from '../WorldOptions';
import {DetectedObject} from './DetectedObject';
import {CameraSnapshot, NormalizedDetectedObject} from './ObjectDetector';

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
    if (!(await this.isAvailable())) {
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
  protected abstract isAvailable(): Promise<boolean>;

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
