import * as THREE from 'three';
import { Script } from '../../core/Script';
import { WorldOptions } from '../WorldOptions';
import { DetectedPlane } from './DetectedPlane';
/**
 * Detects and manages real-world planes provided by the WebXR Plane Detection
 * API. It creates, updates, and removes `Plane` mesh objects in the scene.
 */
export declare class PlaneDetector extends Script {
    static dependencies: {
        options: typeof WorldOptions;
        renderer: typeof THREE.WebGLRenderer;
    };
    /**
     * A map from the WebXR `XRPlane` object to our custom `DetectedPlane` mesh.
     */
    private _detectedPlanes;
    /**
     * The material used for visualizing planes when debugging.
     */
    private _debugMaterial;
    /**
     * The reference space used for poses.
     */
    private _xrRefSpace?;
    private renderer;
    /**
     * Initializes the PlaneDetector.
     */
    init({ options, renderer }: {
        options: WorldOptions;
        renderer: THREE.WebGLRenderer;
    }): void;
    /**
     * Processes the XRFrame to update plane information.
     */
    update(_: number, frame: XRFrame): void;
    /**
     * Creates and adds a new `Plane` mesh to the scene.
     * @param frame - WebXR frame.
     * @param xrPlane - The new WebXR plane object.
     */
    private _addPlaneMesh;
    /**
     * Updates an existing `DetectedPlane` mesh's geometry and pose.
     * @param frame - WebXR frame.
     * @param planeMesh - The mesh to update.
     * @param xrPlane - The updated plane data.
     */
    private _updatePlaneMesh;
    /**
     * Removes a `Plane` mesh from the scene and disposes of its resources.
     * @param xrPlane - The WebXR plane object to remove.
     */
    private _removePlaneMesh;
    /**
     * Updates the position and orientation of a `DetectedPlane` mesh from its XR
     * pose.
     * @param frame - The current XRFrame.
     * @param planeMesh - The mesh to update.
     * @param xrPlane - The plane data with the pose.
     */
    private _updatePlanePose;
    /**
     * Retrieves a list of detected planes, optionally filtered by a semantic
     * label.
     *
     * @param label - The semantic label to filter by (e.g.,
     *     'floor', 'wall').
     * If null or undefined, all detected planes are returned.
     * @returns An array of `DetectedPlane` objects
     *     matching the criteria.
     */
    get(label?: string): DetectedPlane[];
    /**
     * Toggles the visibility of the debug meshes for all planes.
     * Requires `showDebugVisualizations` to be true in the options.
     * @param visible - Whether to show or hide the planes.
     */
    showDebugVisualizations(visible?: boolean): void;
}
