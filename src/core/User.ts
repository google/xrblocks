import * as THREE from 'three';

import {Controller} from '../input/Controller';
import {Hands} from '../input/Hands';
import {Input} from '../input/Input';
import {View} from '../ui/core/View';
import {objectIsDescendantOf} from '../utils/SceneGraphUtils';

import {ObjectGrabEvent, ObjectTouchEvent, Script, SelectEvent} from './Script';

type MaybeXRScript = THREE.Object3D&{isXRScript?: boolean};
type MaybeView = THREE.Object3D&{isView?: boolean};
type MaybeHasIgnoreReticleRaycast = {
  ignoreReticleRaycast?: boolean;
};

/**
 * User is an embodied instance to manage hands, controllers, speech, and
 * avatars. It extends Script to update human-world interaction.
 *
 * In the long run, User is to manages avatars, hands, and everything of Human
 * I/O. In third-person view simulation, it should come with an low-poly avatar.
 * To support multi-user social XR planned for future iterations.
 */
export class User extends Script {
  static dependencies = {
    input: Input,
    scene: THREE.Scene,
  };

  /**
   * Whether to represent a local user, or another user in a multi-user session.
   */
  local = true;

  /**
   * The number of hands associated with the XR user.
   */
  numHands = 2;

  /**
   * The height of the user in meters.
   */
  height = 1.6;

  /**
   * The default distance of a UI panel from the user in meters.
   */
  panelDistance = 1.75;

  /**
   * The handedness (primary hand) of the user (0 for left, 1 for right, 2 for
   * both).
   */
  handedness = 1;

  /**
   * The radius of the safe space around the user in meters.
   */
  safeSpaceRadius = 0.2;

  /**
   * The distance of a newly spawned object from the user in meters.
   */
  objectDistance = 1.5;

  /**
   * The angle of a newly spawned object from the user in radians.
   */
  objectAngle = -18.0 / 180.0 * Math.PI;

  /**
   * An array of pivot objects. Pivot are sphere at the **starting** tip of
   * user's hand / controller / mouse rays for debugging / drawing applications.
   */
  pivots: THREE.Object3D[] = [];

  /**
   * Public data for user interactions, typically holding references to XRHand.
   */
  hands?: Hands;

  /**
   * Maps a controller to the object it is currently hovering over.
   */
  hoveredObjectsForController = new Map<Controller, THREE.Object3D|null>();

  /**
   * Maps a controller to the object it has currently selected.
   */
  selectedObjectsForController = new Map<Controller, THREE.Object3D>();

  /**
   * Maps a hand index (0 or 1) to a set of meshes it is currently touching.
   */
  touchedObjects = new Map<number, Set<THREE.Mesh>>();

  /**
   * Maps a hand index to another map that associates a grabbed mesh with its
   * initial grab event data.
   */
  grabbedObjects = new Map<number, Map<THREE.Mesh, ObjectGrabEvent>>();

  input!: Input;
  scene!: THREE.Scene;
  controllers!: Controller[];

  /**
   * Constructs a new User.
   */
  constructor() {
    super();
  }

  /**
   * Initializes the User.
   */
  init({input, scene}: {input: Input, scene: THREE.Scene}) {
    this.input = input;
    this.controllers = input.controllers;
    this.scene = scene;
  }

  /**
   * Sets the user's height on the first frame.
   * @param camera -
   */
  setHeight(camera: THREE.Camera) {
    this.height = camera.position.y;
  }

  /**
   * Adds pivots at the starting tip of user's hand / controller / mouse rays.
   */
  enablePivots() {
    this.input.enablePivots();
  }

  /**
   * Gets the pivot object for a given controller id.
   * @param id - The controller id.
   * @returns The pivot object.
   */
  getPivot(id: number) {
    return this.controllers[id].getObjectByName('pivot');
  }

  /**
   * Gets the world position of the pivot for a given controller id.
   * @param id - The controller id.
   * @returns The world position of the pivot.
   */
  getPivotPosition(id: number) {
    return this.getPivot(id)?.getWorldPosition(new THREE.Vector3());
  }

  /**
   * Gets reticle's direction in THREE.Vector3.
   * Requires reticle enabled to be called.
   * @param controllerId -
   */
  getReticleDirection(controllerId: number) {
    return this.controllers[controllerId].reticle?.direction;
  }

  /**
   * Gets the object targeted by the reticle.
   * Requires `options.reticle.enabled`.
   * @param id - The controller id.
   * @returns The targeted object, or null.
   */
  getReticleTarget(id: number) {
    return this.controllers[id].reticle?.targetObject;
  }

  /**
   * Gets the intersection details from the reticle's raycast.
   * Requires `options.reticle.enabled`.
   * @param id - The controller id.
   * @returns The intersection object, or null if no intersection.
   */
  getReticleIntersection(id: number) {
    return this.controllers[id].reticle?.intersection;
  }

  /**
   * Checks if any controller is pointing at the given object or its children.
   * @param obj - The object to check against.
   * @returns True if a controller is pointing at the object.
   */
  isPointingAt(obj: THREE.Object3D) {
    for (const selected of this.hoveredObjectsForController.values()) {
      if (objectIsDescendantOf(selected, obj)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Checks if any controller is selecting the given object or its children.
   * @param obj - The object to check against.
   * @returns True if a controller is selecting the object.
   */
  isSelectingAt(obj: THREE.Object3D) {
    for (const selected of this.selectedObjectsForController.values()) {
      if (objectIsDescendantOf(selected, obj)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Gets the intersection point on a specific object.
   * Not recommended for general use, since a View / ModelView's
   * ux.positions contains the intersected points.
   * @param obj - The object to check for intersection.
   * @param id - The controller ID, or -1 for any controller.
   * @returns The intersection details, or null if no intersection.
   */
  getIntersectionAt(obj: THREE.Object3D, id = -1) {
    if (id == -1) {
      for (let i = 0; i < 2; ++i) {
        if (this.getReticleTarget(i) === obj) {
          return this.getReticleIntersection(i);
        }
      }
    } else {
      if (this.getReticleTarget(id) === obj) {
        return this.getReticleIntersection(id);
      }
    }
    return null;
  }

  /**
   * Gets the world position of a controller.
   * @param id - The controller id.
   * @param target - The target vector to
   * store the result.
   * @returns The world position of the controller.
   */
  getControllerPosition(id: number, target = new THREE.Vector3()) {
    this.controllers[id].getWorldPosition(target);
    return target;
  }

  /**
   * Calculates the distance between a controller and an object.
   * @param id - The controller id.
   * @param object - The object to measure the distance to.
   * @returns The distance between the controller and the object.
   */
  getControllerObjectDistance(id: number, object: THREE.Object3D) {
    const controllerPos = this.getControllerPosition(id);
    const objPos = new THREE.Vector3();
    object.getWorldPosition(objPos);
    return controllerPos.distanceTo(objPos);
  }

  /**
   * Checks if either controller is selecting.
   * @param id - The controller id. If -1, check both controllers.
   * @returns True if selecting, false otherwise.
   */
  isSelecting(id = -1) {
    if (id == -1) {
      return this.input.controllers.some((controller) => {
        return controller.userData.selected;
      });
    }
    return this.input.controllers[id].userData.selected;
  }

  /**
   * Checks if either controller is squeezing.
   * @param id - The controller id. If -1, check both controllers.
   * @returns True if squeezing, false otherwise.
   */
  isSqueezing(id = -1) {
    if (id == -1) {
      return this.input.controllers.some((controller) => {
        return controller.userData.squeezing;
      });
    }
    return this.input.controllers[id].userData.squeezing;
  }

  /**
   * Handles the select start event for a controller.
   * @param event - The event object.
   */
  onSelectStart(event: SelectEvent) {
    const controller = event.target;
    const intersections =
        this.input.intersectionsForController.get(controller)!.filter(
            intersection => {
              let target: THREE.Object3D|null = intersection.object;
              while (target) {
                if ((target as MaybeHasIgnoreReticleRaycast)
                        .ignoreReticleRaycast === true) {
                  return false;
                }
                target = target.parent;
              }
              return true;
            });
    if (intersections && intersections.length > 0) {
      this.selectedObjectsForController.set(
          controller, intersections[0].object);
      this.callObjectSelectStart(event, intersections[0].object);
    }
  }

  /**
   * Handles the select end event for a controller.
   * @param event - The event object.
   */
  onSelectEnd(event: SelectEvent) {
    const controller = event.target;
    const intersections = this.input.intersectionsForController.get(controller);
    if (intersections && intersections.length > 0) {
      const selectedObject = this.selectedObjectsForController.get(controller);
      this.callObjectSelectEnd(event, selectedObject || null);
      this.selectedObjectsForController.delete(controller);
      let ancestor: THREE.Object3D|null = selectedObject || null;
      while (ancestor) {
        if ((ancestor as MaybeView).isView && ancestor.visible) {
          (ancestor as View).onTriggered(controller.userData.id);
          break;
        }
        ancestor = ancestor.parent;
      }
    }
  }

  /**
   * Handles the squeeze start event for a controller.
   * @param _event - The event object.
   */
  onSqueezeStart(_event: SelectEvent) {}

  /**
   * Handles the squeeze end event for a controller.
   * @param _event - The event object.
   */
  onSqueezeEnd(_event: SelectEvent) {}

  /**
   * The main update loop called each frame. Updates hover state for all
   * controllers.
   */
  update() {
    if (this.input.controllersEnabled) {
      for (const controller of this.input.controllers) {
        this.updateForController(controller);
      }
    }
    // Direct touch detection.
    this.updateTouchState();
    // Direct grab detection.
    this.updateGrabState();
  }

  /**
   * Checks for and handles grab events (touching + pinching).
   */
  updateGrabState() {
    if (!this.hands) {
      return;
    }

    for (let i = 0; i < this.numHands; i++) {
      const isPinching = this.isSelecting(i);
      const touchedMeshes = this.touchedObjects.get(i) || new Set<THREE.Mesh>();

      const currentlyGrabbedMeshes =
          isPinching ? touchedMeshes : new Set<THREE.Mesh>();
      const previouslyGrabbedMeshesMap =
          this.grabbedObjects.get(i) || new Map();

      const newlyGrabbedMeshes = [...currentlyGrabbedMeshes].filter(
          mesh => !previouslyGrabbedMeshesMap.has(mesh));

      const releasedMeshes = [...previouslyGrabbedMeshesMap.keys()].filter(
          mesh => !currentlyGrabbedMeshes.has(mesh));

      for (const mesh of newlyGrabbedMeshes) {
        const hand = this.hands.getWrist(i);
        if (!hand) continue;

        const grabEvent = {handIndex: i, hand: hand};

        if (!this.grabbedObjects.has(i)) {
          this.grabbedObjects.set(i, new Map());
        }
        this.grabbedObjects.get(i)!.set(mesh, grabEvent);
        this.callObjectGrabStart(grabEvent, mesh);
      }

      for (const mesh of releasedMeshes) {
        const grabEvent = previouslyGrabbedMeshesMap.get(mesh);
        this.callObjectGrabEnd(grabEvent, mesh);
        previouslyGrabbedMeshesMap.delete(mesh);
      }

      for (const mesh of currentlyGrabbedMeshes) {
        if (previouslyGrabbedMeshesMap.has(mesh)) {
          const grabEvent = previouslyGrabbedMeshesMap.get(mesh);
          this.callObjectGrabbing(grabEvent, mesh);
        }
      }
    }
  }

  /**
   * Checks for and handles touch events for the hands' index fingers.
   */
  updateTouchState() {
    if (!this.hands) {
      return;
    }
    for (let i = 0; i < this.numHands; i++) {
      const indexTip = this.hands.getIndexTip(i);
      if (!indexTip) {
        continue;
      }

      const indexTipPosition = new THREE.Vector3();
      indexTip.getWorldPosition(indexTipPosition);

      const currentlyTouchedMeshes: THREE.Mesh[] = [];
      this.scene.traverse((object) => {
        if ((object as Partial<THREE.Mesh>).isMesh && object.visible) {
          const boundingBox = new THREE.Box3().setFromObject(object);
          if (boundingBox.containsPoint(indexTipPosition)) {
            currentlyTouchedMeshes.push(object as THREE.Mesh);
          }
        }
      });

      const previouslyTouchedMeshes = this.touchedObjects.get(i) || new Set();
      const currentMeshesSet = new Set(currentlyTouchedMeshes);

      const newlyTouchedMeshes = currentlyTouchedMeshes.filter(
          mesh => !previouslyTouchedMeshes.has(mesh));
      const removedMeshes = [...previouslyTouchedMeshes].filter(
          mesh => !currentMeshesSet.has(mesh));

      const touchingEvent = {handIndex: i, touchPosition: indexTipPosition};

      if (newlyTouchedMeshes.length > 0) {
        for (const mesh of newlyTouchedMeshes) {
          this.callObjectTouchStart(touchingEvent, mesh);
        }
      }

      if (removedMeshes.length > 0) {
        for (const mesh of removedMeshes) {
          this.callObjectTouchEnd(touchingEvent, mesh);
        }
      }

      for (const mesh of currentMeshesSet) {
        this.callObjectTouching(touchingEvent, mesh);
      }

      if (currentMeshesSet.size > 0) {
        this.touchedObjects.set(i, currentMeshesSet);
      } else {
        this.touchedObjects.delete(i);
      }
    }
  }

  /**
   * Updates the hover state for a single controller.
   * @param controller - The controller to update.
   */
  updateForController(controller: Controller) {
    const intersections =
        this.input.intersectionsForController.get(controller)!;
    const currentHoverTarget =
        intersections.length > 0 ? intersections[0].object : null;
    const previousHoverTarget =
        this.hoveredObjectsForController.get(controller);
    if (previousHoverTarget !== currentHoverTarget) {
      this.callHoverExit(controller, previousHoverTarget || null);
      this.hoveredObjectsForController.set(controller, currentHoverTarget);
      this.callHoverEnter(controller, currentHoverTarget);
    } else if (previousHoverTarget) {
      this.callOnHovering(controller, previousHoverTarget);
    }
  }

  /**
   * Recursively calls onHoverExit on a target and its ancestors.
   * @param controller - The controller exiting hover.
   * @param target - The object being exited.
   */
  callHoverExit(controller: Controller, target: THREE.Object3D|null) {
    if (target == null) return;
    if ((target as MaybeXRScript).isXRScript) {
      (target as Script).onHoverExit(controller);
    }
    this.callHoverExit(controller, target.parent);
  }

  /**
   * Recursively calls onHoverEnter on a target and its ancestors.
   * @param controller - The controller entering hover.
   * @param target - The object being entered.
   */
  callHoverEnter(controller: Controller, target: THREE.Object3D|null) {
    if (target == null) return;
    if ((target as MaybeXRScript).isXRScript) {
      (target as Script).onHoverEnter(controller);
    }
    this.callHoverEnter(controller, target.parent);
  }

  /**
   * Recursively calls onHovering on a target and its ancestors.
   * @param controller - The controller hovering.
   * @param target - The object being entered.
   */
  callOnHovering(controller: Controller, target: THREE.Object3D|null) {
    if (target == null) return;
    if ((target as MaybeXRScript).isXRScript) {
      (target as Script).onHovering(controller);
    }
    this.callOnHovering(controller, target.parent);
  }

  /**
   * Recursively calls onObjectSelectStart on a target and its ancestors until
   * the event is handled.
   * @param event - The original select start event.
   * @param target - The object being selected.
   */
  callObjectSelectStart(event: SelectEvent, target: THREE.Object3D|null) {
    if (target == null) return;
    if ((target as MaybeXRScript).isXRScript &&
        (target as Script).onObjectSelectStart(event)) {
      // The event was handled already so do not propagate up.
      return;
    }
    this.callObjectSelectStart(event, target.parent);
  }

  /**
   * Recursively calls onObjectSelectEnd on a target and its ancestors until
   * the event is handled.
   * @param event - The original select end event.
   * @param target - The object being un-selected.
   */
  callObjectSelectEnd(event: SelectEvent, target: THREE.Object3D|null) {
    if (target == null) return;
    if ((target as MaybeXRScript).isXRScript &&
        (target as Script).onObjectSelectEnd(event)) {
      // The event was handled already so do not propagate up.
      return;
    }
    this.callObjectSelectEnd(event, target.parent);
  }

  /**
   * Recursively calls onObjectTouchStart on a target and its ancestors.
   * @param event - The original touch start event.
   * @param target - The object being touched.
   */
  callObjectTouchStart(event: ObjectTouchEvent, target: THREE.Object3D|null) {
    if (target == null) return;
    if ((target as MaybeXRScript).isXRScript) {
      (target as Script).onObjectTouchStart(event);
    }
    this.callObjectTouchStart(event, target.parent);
  }

  /**
   * Recursively calls onObjectTouching on a target and its ancestors.
   * @param event - The original touch event.
   * @param target - The object being touched.
   */
  callObjectTouching(event: ObjectTouchEvent, target: THREE.Object3D|null) {
    if (target == null) return;
    if ((target as MaybeXRScript).isXRScript) {
      (target as Script).onObjectTouching(event);
    }
    this.callObjectTouching(event, target.parent);
  }

  /**
   * Recursively calls onObjectTouchEnd on a target and its ancestors.
   * @param event - The original touch end event.
   * @param target - The object being un-touched.
   */
  callObjectTouchEnd(event: ObjectTouchEvent, target: THREE.Object3D|null) {
    if (target == null) return;
    if ((target as MaybeXRScript).isXRScript) {
      (target as Script).onObjectTouchEnd(event);
    }
    this.callObjectTouchEnd(event, target.parent);
  }

  /**
   * Recursively calls onObjectGrabStart on a target and its ancestors.
   * @param event - The original grab start event.
   * @param target - The object being grabbed.
   */
  callObjectGrabStart(event: ObjectGrabEvent, target: THREE.Object3D|null) {
    if (target == null) return;
    if ((target as MaybeXRScript).isXRScript) {
      (target as Script).onObjectGrabStart(event);
    }
    this.callObjectGrabStart(event, target.parent);
  }

  /**
   * Recursively calls onObjectGrabbing on a target and its ancestors.
   * @param event - The original grabbing event.
   * @param target - The object being grabbed.
   */
  callObjectGrabbing(event: ObjectGrabEvent, target: THREE.Object3D|null) {
    if (target == null) return;
    if ((target as MaybeXRScript).isXRScript) {
      (target as Script).onObjectGrabbing(event);
    }
    this.callObjectGrabbing(event, target.parent);
  }

  /**
   * Recursively calls onObjectGrabEnd on a target and its ancestors.
   * @param event - The original grab end event.
   * @param target - The object being released.
   */
  callObjectGrabEnd(event: ObjectGrabEvent, target: THREE.Object3D|null) {
    if (target == null) return;
    if ((target as MaybeXRScript).isXRScript) {
      (target as Script).onObjectGrabEnd(event);
    }
    this.callObjectGrabEnd(event, target.parent);
  }

  /**
   * Checks if a controller is selecting a specific object. Returns the
   * intersection details if true.
   * @param obj - The object to check for selection.
   * @param controller - The controller performing the select.
   * @returns The intersection object if a match is found, else null.
   */
  select(obj: THREE.Object3D, controller: THREE.Object3D) {
    const intersections = this.input.intersectionsForController.get(controller);
    return intersections && intersections.length > 0 &&
            objectIsDescendantOf(intersections[0].object, obj) ?
        intersections[0] :
        null;
  }
};
