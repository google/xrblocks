import * as THREE from 'three';

import {View} from '../ui/core/View';

/**
 * UX manages the user experience (UX) state for an interactive object in
 * the scene. It tracks interaction states like hover,
 * selection, and dragging for multiple controllers.
 */
export class UX {
  /**
   * The object this UX state manager is attached to.
   */
  parent;

  /**
   * Indicates if the parent object can be dragged.
   */
  draggable = false;

  /**
   * Indicates if the parent object can be selected.
   */
  selectable = false;

  /**
   * Indicates if the parent object can be touched.
   */
  touchable = false;


  // --- Interaction States ---

  /**
   * An array tracking the selection state for each controller.
   * `selected[i]` is true if controller `i` is selecting the object.
   */
  selected: boolean[] = [];

  /**
   * An array tracking the hover state for each controller.
   * `hovered[i]` is true if controller `i` is hovering over the object.
   */
  hovered: boolean[] = [];

  /**
   * An array tracking the touch state for each controller.
   * `touched[i]` is true if controller `i` is touching over the object.
   */
  touched: boolean[] = [];

  /**
   * An array tracking the drag state for each controller.
   */
  activeDragged: boolean[] = [];


  // --- Intersection Data ---

  /**
   * An array storing the 3D position of the last intersection for each
   * controller.
   */
  positions: THREE.Vector3[] = [];

  /**
   * An array storing the distance of the last intersection for each controller.
   */
  distances: number[] = [];

  /**
   * An array storing the UV coordinates of the last intersection for each
   * controller.
   */
  uvs: THREE.Vector2[] = [];


  // --- Drag Management State ---

  /**
   * The initial position of the object when a drag operation begins.
   */
  initialPosition = new THREE.Vector3();

  /**
   * The initial distance from the controller to the object at the start of a
   * drag for computing the relative dragging distances and angles.
   */
  initialDistance?: number;

  /**
   * @param parent - The script or object that owns this UX instance.
   */
  constructor(parent: THREE.Object3D) {
    this.parent = parent;
  }

  /**
   * Checks if the object is currently being hovered by any controller.
   */
  isHovered() {
    return this.hovered.includes(true);
  }

  /**
   * Checks if the object is currently being selected by any controller.
   */
  isSelected() {
    return this.selected.includes(true);
  }

  /**
   * Checks if the object is currently being dragged by any controller.
   */
  isDragging() {
    return this.activeDragged.includes(true);
  }

  /**
   * Updates the interaction state for a specific controller based on a new
   * intersection. This is internally called by the core input system when a
   * raycast hits the parent object.
   * @param controller - The controller performing the
   *     interaction.
   * @param intersection - The raycast intersection data.
   */
  update(controller: THREE.Object3D, intersection: THREE.Intersection) {
    const id = controller.userData.id;
    this.initializeVariablesForId(id);

    if (intersection.object === this.parent ||
        intersection.object === (this.parent as Partial<View>).mesh) {
      this.hovered[id] = true;
      this.selected[id] = controller.userData.selected;
      if (intersection.uv) {
        this.uvs[id].copy(intersection.uv);
      }
      this.positions[id].copy(intersection.point);
      this.distances[id] = intersection.distance;

      if (!this.selected[id]) {
        this.activeDragged[id] = false;
      }
    }
  }

  /**
   * Ensures that the internal arrays for tracking states are large enough to
   * accommodate a given controller ID.
   * @param id - The controller ID to ensure exists.
   */
  initializeVariablesForId(id: number) {
    while (this.selected.length <= id) {
      this.selected.push(false);
      this.hovered.push(false);
      this.activeDragged.push(false);
      this.positions.push(new THREE.Vector3());
      this.distances.push(1);
      this.uvs.push(new THREE.Vector2());
    }
  }

  /**
   * Resets the hover and selection states for all controllers. This is
   * typically called at the beginning of each frame.
   */
  reset() {
    for (const i in this.selected) {
      this.selected[i] = false;
      this.hovered[i] = false;
    }
  }


  /**
   * Gets the IDs of up to two controllers that are currently hovering over the
   * parent object, always returning a two-element array. This is useful for
   * shaders or components like Panels that expect a fixed number of interaction
   * points.
   *
   * @returns A fixed-size two-element array. Each element is either a
   *     controller ID (e.g., 0, 1) or null.
   */
  getPrimaryTwoControllerIds() {
    const activeControllerIds = [];
    // this.hovered is an array of booleans, indexed by controller ID.
    if (this.hovered) {
      for (let i = 0; i < this.hovered.length && activeControllerIds.length < 2;
           ++i) {
        if (this.hovered[i]) {
          activeControllerIds.push(i);
        }
      }
    }

    // Ensures the returned array always has two elements.
    const controllerId1 = activeControllerIds[0] ?? null;
    const controllerId2 = activeControllerIds[1] ?? null;
    return [controllerId1, controllerId2];
  }
}
