import * as THREE from 'three';
import { Controller } from '../input/Controller';
import { Hands } from '../input/Hands';
import { Input } from '../input/Input';
import { ObjectGrabEvent, ObjectTouchEvent, Script, SelectEvent } from './Script';
/**
 * User is an embodied instance to manage hands, controllers, speech, and
 * avatars. It extends Script to update human-world interaction.
 *
 * In the long run, User is to manages avatars, hands, and everything of Human
 * I/O. In third-person view simulation, it should come with an low-poly avatar.
 * To support multi-user social XR planned for future iterations.
 */
export declare class User extends Script {
    static dependencies: {
        input: typeof Input;
        scene: typeof THREE.Scene;
    };
    /**
     * Whether to represent a local user, or another user in a multi-user session.
     */
    local: boolean;
    /**
     * The number of hands associated with the XR user.
     */
    numHands: number;
    /**
     * The height of the user in meters.
     */
    height: number;
    /**
     * The default distance of a UI panel from the user in meters.
     */
    panelDistance: number;
    /**
     * The handedness (primary hand) of the user (0 for left, 1 for right, 2 for
     * both).
     */
    handedness: number;
    /**
     * The radius of the safe space around the user in meters.
     */
    safeSpaceRadius: number;
    /**
     * The distance of a newly spawned object from the user in meters.
     */
    objectDistance: number;
    /**
     * The angle of a newly spawned object from the user in radians.
     */
    objectAngle: number;
    /**
     * An array of pivot objects. Pivot are sphere at the **starting** tip of
     * user's hand / controller / mouse rays for debugging / drawing applications.
     */
    pivots: THREE.Object3D[];
    /**
     * Public data for user interactions, typically holding references to XRHand.
     */
    hands?: Hands;
    /**
     * Maps a controller to the object it is currently hovering over.
     */
    hoveredObjectsForController: Map<Controller, THREE.Object3D<THREE.Object3DEventMap> | null>;
    /**
     * Maps a controller to the object it has currently selected.
     */
    selectedObjectsForController: Map<Controller, THREE.Object3D<THREE.Object3DEventMap>>;
    /**
     * Maps a hand index (0 or 1) to a set of meshes it is currently touching.
     */
    touchedObjects: Map<number, Set<THREE.Mesh<THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap>, THREE.Material | THREE.Material[], THREE.Object3DEventMap>>>;
    /**
     * Maps a hand index to another map that associates a grabbed mesh with its
     * initial grab event data.
     */
    grabbedObjects: Map<number, Map<THREE.Mesh<THREE.BufferGeometry<THREE.NormalBufferAttributes, THREE.BufferGeometryEventMap>, THREE.Material | THREE.Material[], THREE.Object3DEventMap>, ObjectGrabEvent>>;
    input: Input;
    scene: THREE.Scene;
    controllers: Controller[];
    /**
     * Constructs a new User.
     */
    constructor();
    /**
     * Initializes the User.
     */
    init({ input, scene }: {
        input: Input;
        scene: THREE.Scene;
    }): void;
    /**
     * Sets the user's height on the first frame.
     * @param camera -
     */
    setHeight(camera: THREE.Camera): void;
    /**
     * Adds pivots at the starting tip of user's hand / controller / mouse rays.
     */
    enablePivots(): void;
    /**
     * Gets the pivot object for a given controller id.
     * @param id - The controller id.
     * @returns The pivot object.
     */
    getPivot(id: number): THREE.Object3D<THREE.Object3DEventMap> | undefined;
    /**
     * Gets the world position of the pivot for a given controller id.
     * @param id - The controller id.
     * @returns The world position of the pivot.
     */
    getPivotPosition(id: number): THREE.Vector3 | undefined;
    /**
     * Gets reticle's direction in THREE.Vector3.
     * Requires reticle enabled to be called.
     * @param controllerId -
     */
    getReticleDirection(controllerId: number): THREE.Vector3 | undefined;
    /**
     * Gets the object targeted by the reticle.
     * Requires `options.reticle.enabled`.
     * @param id - The controller id.
     * @returns The targeted object, or null.
     */
    getReticleTarget(id: number): THREE.Object3D<THREE.Object3DEventMap> | undefined;
    /**
     * Gets the intersection details from the reticle's raycast.
     * Requires `options.reticle.enabled`.
     * @param id - The controller id.
     * @returns The intersection object, or null if no intersection.
     */
    getReticleIntersection(id: number): THREE.Intersection<THREE.Object3D<THREE.Object3DEventMap>> | undefined;
    /**
     * Checks if any controller is pointing at the given object or its children.
     * @param obj - The object to check against.
     * @returns True if a controller is pointing at the object.
     */
    isPointingAt(obj: THREE.Object3D): boolean;
    /**
     * Checks if any controller is selecting the given object or its children.
     * @param obj - The object to check against.
     * @returns True if a controller is selecting the object.
     */
    isSelectingAt(obj: THREE.Object3D): boolean;
    /**
     * Gets the intersection point on a specific object.
     * Not recommended for general use, since a View / ModelView's
     * ux.positions contains the intersected points.
     * @param obj - The object to check for intersection.
     * @param id - The controller ID, or -1 for any controller.
     * @returns The intersection details, or null if no intersection.
     */
    getIntersectionAt(obj: THREE.Object3D, id?: number): THREE.Intersection<THREE.Object3D<THREE.Object3DEventMap>> | null | undefined;
    /**
     * Gets the world position of a controller.
     * @param id - The controller id.
     * @param target - The target vector to
     * store the result.
     * @returns The world position of the controller.
     */
    getControllerPosition(id: number, target?: THREE.Vector3): THREE.Vector3;
    /**
     * Calculates the distance between a controller and an object.
     * @param id - The controller id.
     * @param object - The object to measure the distance to.
     * @returns The distance between the controller and the object.
     */
    getControllerObjectDistance(id: number, object: THREE.Object3D): number;
    /**
     * Checks if either controller is selecting.
     * @param id - The controller id. If -1, check both controllers.
     * @returns True if selecting, false otherwise.
     */
    isSelecting(id?: number): any;
    /**
     * Checks if either controller is squeezing.
     * @param id - The controller id. If -1, check both controllers.
     * @returns True if squeezing, false otherwise.
     */
    isSqueezing(id?: number): any;
    /**
     * Handles the select start event for a controller.
     * @param event - The event object.
     */
    onSelectStart(event: SelectEvent): void;
    /**
     * Handles the select end event for a controller.
     * @param event - The event object.
     */
    onSelectEnd(event: SelectEvent): void;
    /**
     * Handles the squeeze start event for a controller.
     * @param _event - The event object.
     */
    onSqueezeStart(_event: SelectEvent): void;
    /**
     * Handles the squeeze end event for a controller.
     * @param _event - The event object.
     */
    onSqueezeEnd(_event: SelectEvent): void;
    /**
     * The main update loop called each frame. Updates hover state for all
     * controllers.
     */
    update(): void;
    /**
     * Checks for and handles grab events (touching + pinching).
     */
    updateGrabState(): void;
    /**
     * Checks for and handles touch events for the hands' index fingers.
     */
    updateTouchState(): void;
    /**
     * Updates the hover state for a single controller.
     * @param controller - The controller to update.
     */
    updateForController(controller: Controller): void;
    /**
     * Recursively calls onHoverExit on a target and its ancestors.
     * @param controller - The controller exiting hover.
     * @param target - The object being exited.
     */
    callHoverExit(controller: Controller, target: THREE.Object3D | null): void;
    /**
     * Recursively calls onHoverEnter on a target and its ancestors.
     * @param controller - The controller entering hover.
     * @param target - The object being entered.
     */
    callHoverEnter(controller: Controller, target: THREE.Object3D | null): void;
    /**
     * Recursively calls onHovering on a target and its ancestors.
     * @param controller - The controller hovering.
     * @param target - The object being entered.
     */
    callOnHovering(controller: Controller, target: THREE.Object3D | null): void;
    /**
     * Recursively calls onObjectSelectStart on a target and its ancestors until
     * the event is handled.
     * @param event - The original select start event.
     * @param target - The object being selected.
     */
    callObjectSelectStart(event: SelectEvent, target: THREE.Object3D | null): void;
    /**
     * Recursively calls onObjectSelectEnd on a target and its ancestors until
     * the event is handled.
     * @param event - The original select end event.
     * @param target - The object being un-selected.
     */
    callObjectSelectEnd(event: SelectEvent, target: THREE.Object3D | null): void;
    /**
     * Recursively calls onObjectTouchStart on a target and its ancestors.
     * @param event - The original touch start event.
     * @param target - The object being touched.
     */
    callObjectTouchStart(event: ObjectTouchEvent, target: THREE.Object3D | null): void;
    /**
     * Recursively calls onObjectTouching on a target and its ancestors.
     * @param event - The original touch event.
     * @param target - The object being touched.
     */
    callObjectTouching(event: ObjectTouchEvent, target: THREE.Object3D | null): void;
    /**
     * Recursively calls onObjectTouchEnd on a target and its ancestors.
     * @param event - The original touch end event.
     * @param target - The object being un-touched.
     */
    callObjectTouchEnd(event: ObjectTouchEvent, target: THREE.Object3D | null): void;
    /**
     * Recursively calls onObjectGrabStart on a target and its ancestors.
     * @param event - The original grab start event.
     * @param target - The object being grabbed.
     */
    callObjectGrabStart(event: ObjectGrabEvent, target: THREE.Object3D | null): void;
    /**
     * Recursively calls onObjectGrabbing on a target and its ancestors.
     * @param event - The original grabbing event.
     * @param target - The object being grabbed.
     */
    callObjectGrabbing(event: ObjectGrabEvent, target: THREE.Object3D | null): void;
    /**
     * Recursively calls onObjectGrabEnd on a target and its ancestors.
     * @param event - The original grab end event.
     * @param target - The object being released.
     */
    callObjectGrabEnd(event: ObjectGrabEvent, target: THREE.Object3D | null): void;
    /**
     * Checks if a controller is selecting a specific object. Returns the
     * intersection details if true.
     * @param obj - The object to check for selection.
     * @param controller - The controller performing the select.
     * @returns The intersection object if a match is found, else null.
     */
    select(obj: THREE.Object3D, controller: THREE.Object3D): THREE.Intersection<THREE.Object3D<THREE.Object3DEventMap>> | null;
}
