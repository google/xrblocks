import * as THREE from 'three';
import { Options } from '../core/Options.js';
import { KeyEvent } from '../core/Script';
import type { Controller, ControllerEvent, ControllerEventMap } from './Controller';
import { GazeController } from './GazeController';
import { MouseController } from './MouseController';
export declare class ActiveControllers extends THREE.Object3D {
}
export type HasIgnoreReticleRaycast = {
    ignoreReticleRaycast: boolean;
};
export type MaybeHasIgnoreReticleRaycast = Partial<HasIgnoreReticleRaycast>;
/**
 * The XRInput class holds all the controllers and performs raycasts through the
 * scene each frame.
 */
export declare class Input {
    options: Options;
    controllers: Controller[];
    controllerGrips: THREE.Group[];
    hands: THREE.XRHandSpace[];
    raycaster: THREE.Raycaster;
    initialized: boolean;
    pivotsEnabled: boolean;
    gazeController: GazeController;
    mouseController: MouseController;
    controllersEnabled: boolean;
    listeners: Map<any, any>;
    intersectionsForController: Map<Controller, THREE.Intersection<THREE.Object3D<THREE.Object3DEventMap>>[]>;
    intersections: never[];
    activeControllers: ActiveControllers;
    leftController?: Controller;
    rightController?: Controller;
    scene: THREE.Scene;
    /**
     * Initializes an instance with XR controllers, grips, hands, raycaster, and
     * default options. Only called by Core.
     */
    init({ scene, options, renderer }: {
        scene: THREE.Scene;
        options: Options;
        renderer: THREE.WebGLRenderer;
    }): void;
    /**
     * Retrieves the controller object by its ID.
     * @param id - The ID of the controller.
     * @returns The controller with the specified ID.
     */
    get(id: number): THREE.Object3D;
    /**
     * Adds an object to both controllers by creating a new group and cloning it.
     * @param obj - The object to add to each controller.
     */
    addObject(obj: THREE.Object3D): void;
    /**
     * Creates a pivot point for each hand, primarily used as a reference
     * point.
     */
    enablePivots(): void;
    /**
     * Adds reticles to the controllers and scene, with initial visibility set to
     * false.
     */
    addReticles(): void;
    /**
     * Default action to handle the start of a selection, setting the selecting
     * state to true.
     */
    defaultOnSelectStart(event: ControllerEvent): void;
    /**
     * Default action to handle the end of a selection, setting the selecting
     * state to false.
     */
    defaultOnSelectEnd(event: ControllerEvent): void;
    defaultOnSqueezeStart(event: ControllerEvent): void;
    defaultOnSqueezeEnd(event: ControllerEvent): void;
    defaultOnConnected(event: ControllerEvent): void;
    defaultOnDisconnected(event: ControllerEvent): void;
    /**
     * Binds a listener to both controllers.
     * @param listenerName - Event name
     * @param listener - Function to call
     */
    bindListener(listenerName: keyof ControllerEventMap, listener: (event: ControllerEvent) => void): void;
    unbindListener(listenerName: keyof ControllerEventMap, listener: (event: ControllerEvent) => void): void;
    dispatchEvent(event: ControllerEvent): void;
    /**
     * Binds an event listener to handle 'selectstart' events for both
     * controllers.
     * @param event - The event listener function.
     */
    bindSelectStart(event: (event: ControllerEvent) => void): void;
    /**
     * Binds an event listener to handle 'selectend' events for both controllers.
     * @param event - The event listener function.
     */
    bindSelectEnd(event: (event: ControllerEvent) => void): void;
    /**
     * Binds an event listener to handle 'select' events for both controllers.
     * @param event - The event listener function.
     */
    bindSelect(event: (event: ControllerEvent) => void): void;
    /**
     * Binds an event listener to handle 'squeezestart' events for both
     * controllers.
     * @param event - The event listener function.
     */
    bindSqueezeStart(event: (event: ControllerEvent) => void): void;
    /**
     * Binds an event listener to handle 'squeezeend' events for both controllers.
     * @param event - The event listener function.
     */
    bindSqueezeEnd(event: (event: ControllerEvent) => void): void;
    bindSqueeze(event: (event: ControllerEvent) => void): void;
    bindKeyDown(event: (event: KeyEvent) => void): void;
    bindKeyUp(event: (event: KeyEvent) => void): void;
    unbindKeyDown(event: (event: KeyEvent) => void): void;
    unbindKeyUp(event: (event: KeyEvent) => void): void;
    /**
     * Finds intersections between a controller's ray and a specified object.
     * @param controller - The controller casting the ray.
     * @param obj - The object to intersect.
     * @returns Array of intersection points, if any.
     */
    intersectObjectByController(controller: THREE.Object3D, obj: THREE.Object3D): THREE.Intersection[];
    /**
     * Finds intersections based on an event's target controller and a specified
     * object.
     * @param event - The event containing the controller reference.
     * @param obj - The object to intersect.
     * @returns Array of intersection points, if any.
     */
    intersectObjectByEvent(event: ControllerEvent, obj: THREE.Object3D): THREE.Intersection[];
    /**
     * Finds intersections with an object from either controller.
     * @param obj - The object to intersect.
     * @returns Array of intersection points, if any.
     */
    intersectObject(obj: THREE.Object3D): THREE.Intersection[];
    update(): void;
    updateController(controller: Controller): void;
    /**
     * Sets the raycaster's origin and direction from any Object3D that
     * represents a controller. This replaces the non-standard
     * `setFromXRController`.
     * @param controller - The controller to cast a ray from.
     */
    private _setRaycasterFromController;
    updateReticleFromIntersections(controller: Controller): void;
    enableGazeController(): void;
    disableGazeController(): void;
    disableControllers(): void;
    enableControllers(): void;
    performRaycastOnScene(controller: Controller): void;
}
