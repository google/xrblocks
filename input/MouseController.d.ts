import * as THREE from 'three';
import { Script } from '../core/Script.js';
import { Controller } from './Controller.js';
/** Defines the event map for the MouseController's custom events. */
interface MouseControllerEventMap extends THREE.Object3DEventMap {
    connected: {
        target: MouseController;
    };
    disconnected: {
        target: MouseController;
    };
    selectstart: {
        target: MouseController;
    };
    selectend: {
        target: MouseController;
    };
}
/**
 * Simulates an XR controller using the mouse for desktop
 * environments. This class translates 2D mouse movements on the screen into a
 * 3D ray in the scene, allowing for point-and-click interactions in a
 * non-immersive context. It functions as a virtual controller that is always
 * aligned with the user's pointer.
 */
export declare class MouseController extends Script<MouseControllerEventMap> implements Controller {
    static dependencies: {
        camera: typeof THREE.Camera;
    };
    /**
     * User data for the controller, including its connection status, unique ID,
     * and selection state (mouse button pressed).
     */
    userData: {
        id: number;
        connected: boolean;
        selected: boolean;
    };
    /** A THREE.Raycaster used to determine the 3D direction of the mouse. */
    raycaster: THREE.Raycaster;
    /** A normalized vector representing the default forward direction. */
    forwardVector: THREE.Vector3;
    /** A reference to the main scene camera. */
    camera: THREE.Camera;
    constructor();
    /**
     * Initialize the MouseController
     */
    init({ camera }: {
        camera: THREE.Camera;
    }): void;
    /**
     * The main update loop, called every frame.
     * If connected, it syncs the controller's origin point with the camera's
     * position.
     */
    update(): void;
    /**
     * Updates the controller's transform based on the mouse's position on the
     * screen. This method sets both the position and rotation, ensuring the
     * object has a valid world matrix for raycasting.
     * @param event - The mouse event containing clientX and clientY coordinates.
     */
    updateMousePositionFromEvent(event: MouseEvent): void;
    /**
     * Dispatches a 'selectstart' event, simulating the start of a controller
     * press (e.g., mouse down).
     */
    callSelectStart(): void;
    /**
     * Dispatches a 'selectend' event, simulating the end of a controller press
     * (e.g., mouse up).
     */
    callSelectEnd(): void;
    /**
     * "Connects" the virtual controller, notifying the input system that it is
     * active.
     */
    connect(): void;
    /**
     * "Disconnects" the virtual controller.
     */
    disconnect(): void;
}
export {};
