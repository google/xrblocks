import * as THREE from 'three';
import { AI } from '../../ai/AI';
import { AIOptions } from '../../ai/AIOptions';
import { XRDeviceCamera } from '../../camera/XRDeviceCamera';
import { Script } from '../../core/Script';
import { Depth } from '../../depth/Depth';
import { WorldOptions } from '../WorldOptions';
import { DetectedObject } from './DetectedObject';
/**
 * Detects objects in the user's environment using a specified backend.
 * It queries an AI model with the device camera feed and returns located
 * objects with 2D and 3D positioning data.
 */
export declare class ObjectDetector extends Script {
    static dependencies: {
        options: typeof WorldOptions;
        ai: typeof AI;
        aiOptions: typeof AIOptions;
        deviceCamera: typeof XRDeviceCamera;
        depth: typeof Depth;
        camera: typeof THREE.Camera;
    };
    /**
     * A map from the object's UUID to our custom `DetectedObject` instance.
     */
    private _detectedObjects;
    private _debugVisualsGroup?;
    /**
     * The configuration for the Gemini backend.
     */
    private _geminiConfig;
    private options;
    private ai;
    private aiOptions;
    private deviceCamera;
    private depth;
    private camera;
    /**
     * Initializes the ObjectDetector.
     * @override
     */
    init({ options, ai, aiOptions, deviceCamera, depth, camera }: {
        options: WorldOptions;
        ai: AI;
        aiOptions: AIOptions;
        deviceCamera: XRDeviceCamera;
        depth: Depth;
        camera: THREE.Camera;
    }): void;
    /**
     * Runs the object detection process based on the configured backend.
     * @returns A promise that resolves with an
     * array of detected `DetectedObject` instances.
     */
    runDetection(): Promise<(DetectedObject | null | undefined)[]>;
    /**
     * Runs object detection using the Gemini backend.
     */
    private _runGeminiDetection;
    /**
     * Retrieves a list of currently detected objects.
     *
     * @param label - The semantic label to filter by (e.g., 'chair'). If null,
     *     all objects are returned.
     * @returns An array of `Object` instances.
     */
    get(label?: null): DetectedObject[];
    /**
     * Removes all currently detected objects from the scene and internal
     * tracking.
     */
    clear(): this;
    /**
     * Toggles the visibility of all debug visualizations for detected objects.
     * @param visible - Whether the visualizations should be visible.
     */
    showDebugVisualizations(visible?: boolean): void;
    /**
     * Draws the detected bounding boxes on the input image and triggers a
     * download for debugging.
     * @param base64Image - The base64 encoded input image.
     * @param detections - The array of detected objects from the
     * AI response.
     */
    private _visualizeBoundingBoxesOnImage;
    /**
     * Creates a simple debug visualization for an object based on its position
     * (center of its 2D detection bounding box).
     * @param object - The detected object to visualize.
     */
    private _createDebugVisual;
    /**
     * Builds the Gemini configuration object from the world options.
     */
    private _buildGeminiConfig;
}
