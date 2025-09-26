import * as THREE from 'three';
import { Script } from '../core/Script';
import { ObjectDetector } from './objects/ObjectDetector';
import { PlaneDetector } from './planes/PlaneDetector';
import { WorldOptions } from './WorldOptions';
/**
 * Manages all interactions with the real-world environment perceived by the XR
 * device. This class abstracts the complexity of various perception APIs
 * (Depth, Planes, Meshes, etc.) and provides a simple, event-driven interface
 * for developers to use `this.world.depth.mesh`, `this.world.planes`.
 */
export declare class World extends Script {
    static dependencies: {
        options: typeof WorldOptions;
        camera: typeof THREE.Camera;
    };
    /**
     * Configuration options for all world-sensing features.
     */
    options: WorldOptions;
    /**
     * The depth module instance. Null if not enabled.
     */
    /**
     * The light estimation module instance. Null if not enabled.
     */
    /**
     * The plane detection module instance. Null if not enabled.
     * Not recommended for anchoring.
     */
    planes?: PlaneDetector;
    /**
     * The scene mesh module instance. Null if not enabled.
     * TODO: Not yet supported in Chrome.
     */
    /**
     * The object recognition module instance. Null if not enabled.
     */
    objects?: ObjectDetector;
    /**
     * A Three.js Raycaster for performing intersection tests.
     */
    private raycaster;
    private camera;
    /**
     * Initializes the world-sensing modules based on the provided configuration.
     * This method is called automatically by the XRCore.
     */
    init({ options, camera }: {
        options: WorldOptions;
        camera: THREE.Camera;
    }): Promise<void>;
    /**
     * Places an object at the reticle.
     */
    anchorObjectAtReticle(_object: THREE.Object3D, _reticle: THREE.Object3D): void;
    /**
     * Updates all active world-sensing modules with the latest XRFrame data.
     * This method is called automatically by the XRCore on each frame.
     * @param _timestamp - The timestamp for the current frame.
     * @param frame - The current XRFrame, containing environmental
     * data.
     * @override
     */
    update(_timestamp: number, frame?: XRFrame): void;
    /**
     * Performs a raycast from a controller against detected real-world surfaces
     * (currently planes) and places a 3D object at the intersection point,
     * oriented to face the user.
     *
     * We recommend using /templates/3_depth/ to anchor objects based on
     * depth mesh for mixed reality experience for accuracy. This function is
     * design for demonstration purposes.
     *
     * @param objectToPlace - The object to position in the
     * world.
     * @param controller - The controller to use for raycasting.
     * @returns True if the object was successfully placed, false
     * otherwise.
     */
    placeOnSurface(objectToPlace: THREE.Object3D, controller: THREE.Object3D): boolean;
    /**
     * Toggles the visibility of all debug visualizations for world features.
     * @param visible - Whether the visualizations should be visible.
     */
    showDebugVisualizations(visible?: boolean): void;
}
