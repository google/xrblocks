import * as THREE from 'three';

import {AI} from '../../ai/AI';
import {AIOptions} from '../../ai/AIOptions';
import {Gemini} from '../../ai/Gemini';
import {cropImage, transformRgbUvToWorld} from '../../camera/CameraUtils';
import {XRDeviceCamera} from '../../camera/XRDeviceCamera';
import {Script} from '../../core/Script';
import {Depth} from '../../depth/Depth';
import {parseBase64DataURL} from '../../utils/utils';
import {WorldOptions} from '../WorldOptions';

import {DetectedObject} from './DetectedObject';

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
  };

  /**
   * A map from the object's UUID to our custom `DetectedObject` instance.
   */
  private _detectedObjects = new Map<string, DetectedObject>();

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
  private camera!: THREE.Camera;

  /**
   * Initializes the ObjectDetector.
   * @override
   */
  init({options, ai, aiOptions, deviceCamera, depth, camera}: {
    options: WorldOptions,
    ai: AI,
    aiOptions: AIOptions,
    deviceCamera: XRDeviceCamera,
    depth: Depth,
    camera: THREE.Camera,
  }) {
    this.options = options;
    this.ai = ai;
    this.aiOptions = aiOptions;
    this.deviceCamera = deviceCamera;
    this.depth = depth;
    this.camera = camera;
    this._geminiConfig = this._buildGeminiConfig();

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
  async runDetection() {
    this.clear();  // Clear previous results before starting a new detection.

    switch (this.options.objects.backendConfig.activeBackend) {
      case 'gemini':
        return this._runGeminiDetection();
      // Future backends like 'mediapipe' will be handled here.
      // case 'mediapipe':
      //   return this._runMediaPipeDetection();
      default:
        console.warn(`ObjectDetector backend '${
            this.options.objects.backendConfig
                .activeBackend}' is not supported.`);
        return [];
    }
  }

  /**
   * Runs object detection using the Gemini backend.
   */
  private async _runGeminiDetection() {
    if (!this.ai.isAvailable()) {
      console.error('Gemini is unavailable for object detection.');
      return [];
    }

    const base64Image =
        this.deviceCamera.getSnapshot({outputFormat: 'base64'}) as string |
        null;
    if (!base64Image) {
      console.warn('Could not get device camera snapshot.');
      return [];
    }

    const {mimeType, strippedBase64} = parseBase64DataURL(base64Image);

    // Cache depth and camera data to align with the captured image frame.
    const cachedDepthArray = this.depth.depthArray[0].slice(0);
    const cachedMatrixWorld = this.camera.matrixWorld.clone();

    // Temporarily set the Gemini config for this specific query type.
    const originalGeminiConfig = this.aiOptions.gemini.config;
    this.aiOptions.gemini.config = this._geminiConfig;
    const textPrompt = 'What do you see in this image?';

    try {
      const rawResponse = await (this.ai.model as Gemini).query({
        type: 'multiPart',
        parts: [
          {inlineData: {mimeType: mimeType || undefined, data: strippedBase64}},
          {text: textPrompt}
        ]
      });

      let parsedResponse;
      try {
        if (rawResponse && rawResponse.text) {
          parsedResponse = JSON.parse(rawResponse.text);
        } else {
          console.error(
              'AI response is missing text field:', rawResponse,
              'Raw response was:', rawResponse);
          return [];
        }
      } catch (e) {
        console.error(
            'Failed to parse AI response JSON:', e,
            'Raw response was:', rawResponse);
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
        const {ymin, xmin, ymax, xmax, objectName, ...additionalData} =
            item || {};
        if ([ymin, xmin, ymax, xmax].some(coord => typeof coord !== 'number')) {
          return null;
        }

        // Bounding box from AI is 0-1000, convert to normalized 0-1.
        const boundingBox = new THREE.Box2(
            new THREE.Vector2(xmin / 1000, ymin / 1000),
            new THREE.Vector2(xmax / 1000, ymax / 1000));

        const center = new THREE.Vector2();
        boundingBox.getCenter(center);

        const uvInput = {u: center.x, v: center.y};
        const projectionMatrix = this.deviceCamera.simulatorCamera ?
            this.camera.projectionMatrix :
            new THREE.Matrix4().fromArray(this.depth.view[0].projectionMatrix);
        const worldPosition = transformRgbUvToWorld(
            uvInput, cachedDepthArray, projectionMatrix, cachedMatrixWorld,
            this.deviceCamera, this.depth);

        if (worldPosition) {
          const margin = this.options.objects.objectImageMargin;

          // Create a new bounding box for cropping that includes the margin.
          const cropBox = boundingBox.clone();
          cropBox.min.subScalar(margin);
          cropBox.max.addScalar(margin);
          const objectImage = await cropImage(base64Image, cropBox);

          const object = new DetectedObject(
              objectName, objectImage, boundingBox, additionalData);
          object.position.copy(worldPosition);

          this.add(object);
          this._detectedObjects.set(object.uuid, object);

          if (this._debugVisualsGroup) {
            this._createDebugVisual(object);
          }
          return object;
        }
      });

      const detectedObjects =
          (await Promise.all(detectionPromises)).filter(Boolean);
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
   *     all objects are returned.
   * @returns An array of `Object` instances.
   */
  get(label = null) {
    const allObjects = Array.from(this._detectedObjects.values());
    if (!label) {
      return allObjects;
    }
    return allObjects.filter(obj => obj.label === label);
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
   * @param detections - The array of detected objects from the
   * AI response.
   */
  private _visualizeBoundingBoxesOnImage(
      base64Image: string, detections: object[]) {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d')!;

      ctx.drawImage(img, 0, 0);

      detections.forEach((item) => {
        const {ymin, xmin, ymax, xmax, objectName} = (item || {}) as {
          ymin?: number,
          xmin?: number,
          ymax?: number,
          xmax?: number,
          objectName?: string,
        };
        if ([ymin, xmin, ymax, xmax].some(
                (coord) => typeof coord !== 'number')) {
          return;
        }

        // Bounding box from AI is 0-1000, scale it to image dimensions.
        const rectX = xmin! / 1000 * canvas.width;
        const rectY = ymin! / 1000 * canvas.height;
        const rectWidth = (xmax! - xmin!) / 1000 * canvas.width;
        const rectHeight = (ymax! - ymin!) / 1000 * canvas.height;

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
            rectX, rectY - fontSize, textMetrics.width + 8, fontSize + 4);

        // Draw the text itself.
        ctx.fillStyle = '#FFFFFF';  // White text
        ctx.fillText(text, rectX + 4, rectY + 2);
      });

      // Create a link and trigger the download.
      const timestamp =
          new Date().toISOString().slice(0, 19).replace('T', '_').replace(
              /:/g, '-');
      const link = document.createElement('a');
      link.download = `detection_debug_${timestamp}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
    };
    img.src = base64Image;
  }

  /**
   * Creates a simple debug visualization for an object based on its position
   * (center of its 2D detection bounding box).
   * @param object - The detected object to visualize.
   */
  private async _createDebugVisual(object: DetectedObject) {
    // Create sphere.
    const sphere = new THREE.Mesh(
        new THREE.SphereGeometry(0.03, 16, 16),
        new THREE.MeshBasicMaterial({color: 0xff4285F4}));
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
    textLabel.position.y += 0.04;  // Offset above the sphere.

    this._debugVisualsGroup!.add(sphere, textLabel);
    textLabel.sync();  // Required for Troika text to appear.
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
      systemInstruction: [{text: geminiOptions.systemInstruction}],
    };
  }
}
