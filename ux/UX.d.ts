import * as THREE from 'three';
/**
 * UX manages the user experience (UX) state for an interactive object in
 * the scene. It tracks interaction states like hover,
 * selection, and dragging for multiple controllers.
 */
export declare class UX {
    /**
     * The object this UX state manager is attached to.
     */
    parent: THREE.Object3D<THREE.Object3DEventMap>;
    /**
     * Indicates if the parent object can be dragged.
     */
    draggable: boolean;
    /**
     * Indicates if the parent object can be selected.
     */
    selectable: boolean;
    /**
     * Indicates if the parent object can be touched.
     */
    touchable: boolean;
    /**
     * An array tracking the selection state for each controller.
     * `selected[i]` is true if controller `i` is selecting the object.
     */
    selected: boolean[];
    /**
     * An array tracking the hover state for each controller.
     * `hovered[i]` is true if controller `i` is hovering over the object.
     */
    hovered: boolean[];
    /**
     * An array tracking the touch state for each controller.
     * `touched[i]` is true if controller `i` is touching over the object.
     */
    touched: boolean[];
    /**
     * An array tracking the drag state for each controller.
     */
    activeDragged: boolean[];
    /**
     * An array storing the 3D position of the last intersection for each
     * controller.
     */
    positions: THREE.Vector3[];
    /**
     * An array storing the distance of the last intersection for each controller.
     */
    distances: number[];
    /**
     * An array storing the UV coordinates of the last intersection for each
     * controller.
     */
    uvs: THREE.Vector2[];
    /**
     * The initial position of the object when a drag operation begins.
     */
    initialPosition: THREE.Vector3;
    /**
     * The initial distance from the controller to the object at the start of a
     * drag for computing the relative dragging distances and angles.
     */
    initialDistance?: number;
    /**
     * @param parent - The script or object that owns this UX instance.
     */
    constructor(parent: THREE.Object3D);
    /**
     * Checks if the object is currently being hovered by any controller.
     */
    isHovered(): boolean;
    /**
     * Checks if the object is currently being selected by any controller.
     */
    isSelected(): boolean;
    /**
     * Checks if the object is currently being dragged by any controller.
     */
    isDragging(): boolean;
    /**
     * Updates the interaction state for a specific controller based on a new
     * intersection. This is internally called by the core input system when a
     * raycast hits the parent object.
     * @param controller - The controller performing the
     *     interaction.
     * @param intersection - The raycast intersection data.
     */
    update(controller: THREE.Object3D, intersection: THREE.Intersection): void;
    /**
     * Ensures that the internal arrays for tracking states are large enough to
     * accommodate a given controller ID.
     * @param id - The controller ID to ensure exists.
     */
    initializeVariablesForId(id: number): void;
    /**
     * Resets the hover and selection states for all controllers. This is
     * typically called at the beginning of each frame.
     */
    reset(): void;
    /**
     * Gets the IDs of up to two controllers that are currently hovering over the
     * parent object, always returning a two-element array. This is useful for
     * shaders or components like Panels that expect a fixed number of interaction
     * points.
     *
     * @returns A fixed-size two-element array. Each element is either a
     *     controller ID (e.g., 0, 1) or null.
     */
    getPrimaryTwoControllerIds(): number[];
}
