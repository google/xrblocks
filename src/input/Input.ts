import * as THREE from 'three';
import {XRControllerModelFactory} from 'three/addons/webxr/XRControllerModelFactory.js';
import {XRHandModelFactory} from 'three/addons/webxr/XRHandModelFactory.js';

import {NUM_HANDS} from '../constants';
import {Options} from '../core/Options.js';
import {KeyEvent, Script} from '../core/Script';
import {Reticle} from '../ui/core/Reticle.js';

import {ControllerRayVisual} from './components/ControllerRayVisual';
import type {Controller, ControllerEvent, ControllerEventMap} from './Controller';
import {GazeController} from './GazeController';
import {MouseController} from './MouseController';

export class ActiveControllers extends THREE.Object3D {};

export type HasIgnoreReticleRaycast = {
  ignoreReticleRaycast: boolean;
};
export type MaybeHasIgnoreReticleRaycast = Partial<HasIgnoreReticleRaycast>;

// Reusable objects for performance.
const MATRIX4 = new THREE.Matrix4();

/**
 * The XRInput class holds all the controllers and performs raycasts through the
 * scene each frame.
 */
export class Input {
  options!: Options;
  controllers: Controller[] = [];
  controllerGrips: THREE.Group[] = [];
  hands: THREE.XRHandSpace[] = [];
  raycaster = new THREE.Raycaster();
  initialized = false;
  pivotsEnabled = false;
  gazeController = new GazeController();
  mouseController = new MouseController();
  controllersEnabled = true;
  listeners = new Map();
  intersectionsForController = new Map<Controller, THREE.Intersection[]>();
  intersections = [];
  activeControllers = new ActiveControllers();
  leftController?: Controller;
  rightController?: Controller;
  scene!: THREE.Scene;

  /**
   * Initializes an instance with XR controllers, grips, hands, raycaster, and
   * default options. Only called by Core.
   */
  init({scene, options, renderer}: {
    scene: THREE.Scene,
    options: Options,
    renderer: THREE.WebGLRenderer
  }) {
    scene.add(this.activeControllers);

    this.options = options;
    this.scene = scene;

    const controllers = this.controllers;
    const controllerGrips = this.controllerGrips;

    for (let i = 0; i < NUM_HANDS; ++i) {
      controllers.push(renderer.xr.getController(i));
      controllers[i].userData.id = i;
      this.activeControllers.add(this.controllers[i]);
    }
    controllers.push(this.gazeController);
    controllers.push(this.mouseController);
    this.activeControllers.add(this.mouseController);

    for (const controller of controllers) {
      this.intersectionsForController.set(controller, []);
    }

    if (options.controllers.enabled) {
      if (options.controllers.visualization) {
        const controllerModelFactory = new XRControllerModelFactory();
        for (let i = 0; i < NUM_HANDS; ++i) {
          controllerGrips.push(renderer.xr.getControllerGrip(i));
          controllerGrips[i].add(
              controllerModelFactory.createControllerModel(controllerGrips[i]));
          this.activeControllers.add(controllerGrips[i]);
        }
      }

      // TODO: Separate logic to XR Hands.
      if (options.hands.enabled) {
        for (let i = 0; i < NUM_HANDS; ++i) {
          this.hands.push(renderer.xr.getHand(i));
          this.activeControllers.add(this.hands[i]);
        }

        if (options.hands.visualization) {
          if (options.hands.visualizeJoints) {
            console.log('Visualize hand joints.');
            const handModelFactory = new XRHandModelFactory();
            for (let i = 0; i < NUM_HANDS; ++i) {
              const handModel =
                  handModelFactory.createHandModel(this.hands[i], 'boxes');
              (handModel as MaybeHasIgnoreReticleRaycast).ignoreReticleRaycast =
                  true;
              this.hands[i].add(handModel);
            }
          }
          if (options.hands.visualizeMeshes) {
            console.log('Visualize hand meshes.');
            const handModelFactory = new XRHandModelFactory();
            for (let i = 0; i < NUM_HANDS; ++i) {
              const handModel =
                  handModelFactory.createHandModel(this.hands[i], 'mesh');
              (handModel as MaybeHasIgnoreReticleRaycast).ignoreReticleRaycast =
                  true;
              this.hands[i].add(handModel);
            }
          }
        }
      }
    }

    if (options.controllers.visualizeRays) {
      for (let i = 0; i < NUM_HANDS; ++i) {
        controllers[i].add(new ControllerRayVisual());
      }
    }

    this.bindSelectStart(this.defaultOnSelectStart.bind(this));
    this.bindSelectEnd(this.defaultOnSelectEnd.bind(this));
    this.bindSqueezeStart(this.defaultOnSelectStart.bind(this));
    this.bindSqueezeEnd(this.defaultOnSelectEnd.bind(this));
    this.bindListener('connected', this.defaultOnConnected.bind(this));
    this.bindListener('disconnected', this.defaultOnDisconnected.bind(this));
  }

  /**
   * Retrieves the controller object by its ID.
   * @param id - The ID of the controller.
   * @returns The controller with the specified ID.
   */
  get(id: number): THREE.Object3D {
    return this.controllers[id];
  }

  /**
   * Adds an object to both controllers by creating a new group and cloning it.
   * @param obj - The object to add to each controller.
   */
  addObject(obj: THREE.Object3D) {
    const group = new THREE.Group();
    group.add(obj);
    // Clones the group for each controller, adding it to the controller.
    for (let i = 0; i < this.controllers.length; ++i) {
      this.controllers[i].add(group.clone());
    }
  }

  /**
   * Creates a pivot point for each hand, primarily used as a reference
   * point.
   */
  enablePivots() {
    if (this.pivotsEnabled) return;
    this.pivotsEnabled = true;
    const pivot = new THREE.Mesh(new THREE.IcosahedronGeometry(0.01, 3));
    pivot.name = 'pivot';
    pivot.position.z = -0.05;
    this.addObject(pivot);
  }

  /**
   * Adds reticles to the controllers and scene, with initial visibility set to
   * false.
   */
  addReticles() {
    let id = 0;
    for (const controller of this.controllers) {
      if (controller.reticle == null) {
        controller.reticle = new Reticle();
        controller.reticle.name = 'Reticle ' + id;
        ++id;
      }
      controller.reticle.visible = false;
      this.scene.add(controller.reticle);
    }
  }

  /**
   * Default action to handle the start of a selection, setting the selecting
   * state to true.
   */
  defaultOnSelectStart(event: ControllerEvent) {
    const controller = event.target;
    controller.userData.selected = true;
    this._setRaycasterFromController(controller);
    this.performRaycastOnScene(controller);
  }

  /**
   * Default action to handle the end of a selection, setting the selecting
   * state to false.
   */
  defaultOnSelectEnd(event: ControllerEvent) {
    const controller = event.target;
    controller.userData.selected = false;
  }

  defaultOnSqueezeStart(event: ControllerEvent) {
    const controller = event.target;
    controller.userData.squeezing = true;
  }

  defaultOnSqueezeEnd(event: ControllerEvent) {
    const controller = event.target;
    controller.userData.squeezing = false;
  }

  defaultOnConnected(event: ControllerEvent) {
    const controller = event.target;
    controller.userData.connected = true;
    controller.gamepad = event.data?.gamepad;
    controller.inputSource = event.data;
    switch (event.data?.handedness) {
      case 'left':
        this.leftController = controller;
        break;
      case 'right':
        this.rightController = controller;
        break;
    }
  }

  defaultOnDisconnected(event: ControllerEvent) {
    const controller = event.target;
    controller.userData.connected = false;
    if (controller.reticle) {
      controller.reticle.visible = false;
    }
    delete controller?.gamepad;
    switch (event.data?.handedness) {
      case 'left':
        this.leftController = undefined;
        break;
      case 'right':
        this.rightController = undefined;
        break;
    }
  }

  /**
   * Binds a listener to both controllers.
   * @param listenerName - Event name
   * @param listener - Function to call
   */
  bindListener(
      listenerName: keyof ControllerEventMap,
      listener: (event: ControllerEvent) => void) {
    for (const controller of this.controllers) {
      controller.addEventListener(listenerName, listener);
    }
    if (!this.listeners.has(listenerName)) {
      this.listeners.set(listenerName, []);
    }
    this.listeners.get(listenerName).push(listener);
  }

  unbindListener(
      listenerName: keyof ControllerEventMap,
      listener: (event: ControllerEvent) => void) {
    if (this.listeners.has(listenerName)) {
      const listeners = this.listeners.get(listenerName);
      const index = listeners.indexOf(listener);
      if (index !== -1) {
        listeners.splice(index, 1);
      }
    }
    for (const controller of this.controllers) {
      controller.removeEventListener(listenerName, listener);
    }
  }

  dispatchEvent(event: ControllerEvent) {
    if (this.listeners.has(event.type)) {
      for (const listener of this.listeners.get(event.type)) {
        listener(event);
      }
    }
  }

  /**
   * Binds an event listener to handle 'selectstart' events for both
   * controllers.
   * @param event - The event listener function.
   */
  bindSelectStart(event: (event: ControllerEvent) => void) {
    this.bindListener('selectstart', event);
  }

  /**
   * Binds an event listener to handle 'selectend' events for both controllers.
   * @param event - The event listener function.
   */
  bindSelectEnd(event: (event: ControllerEvent) => void) {
    this.bindListener('selectend', event);
  }

  /**
   * Binds an event listener to handle 'select' events for both controllers.
   * @param event - The event listener function.
   */
  bindSelect(event: (event: ControllerEvent) => void) {
    this.bindListener('select', event);
  }

  /**
   * Binds an event listener to handle 'squeezestart' events for both
   * controllers.
   * @param event - The event listener function.
   */
  bindSqueezeStart(event: (event: ControllerEvent) => void) {
    this.bindListener('squeezestart', event);
  }

  /**
   * Binds an event listener to handle 'squeezeend' events for both controllers.
   * @param event - The event listener function.
   */
  bindSqueezeEnd(event: (event: ControllerEvent) => void) {
    this.bindListener('squeezeend', event);
  }

  bindSqueeze(event: (event: ControllerEvent) => void) {
    this.bindListener('squeeze', event);
  }

  bindKeyDown(event: (event: KeyEvent) => void) {
    window.addEventListener('keydown', event);
  }

  bindKeyUp(event: (event: KeyEvent) => void) {
    window.addEventListener('keyup', event);
  }

  unbindKeyDown(event: (event: KeyEvent) => void) {
    window.removeEventListener('keydown', event);
  }

  unbindKeyUp(event: (event: KeyEvent) => void) {
    window.removeEventListener('keyup', event);
  }

  /**
   * Finds intersections between a controller's ray and a specified object.
   * @param controller - The controller casting the ray.
   * @param obj - The object to intersect.
   * @returns Array of intersection points, if any.
   */
  intersectObjectByController(controller: THREE.Object3D, obj: THREE.Object3D):
      THREE.Intersection[] {
    controller.updateMatrixWorld();
    this.raycaster.setFromXRController(controller as THREE.XRTargetRaySpace);
    return this.raycaster.intersectObject(obj, false);
  }

  /**
   * Finds intersections based on an event's target controller and a specified
   * object.
   * @param event - The event containing the controller reference.
   * @param obj - The object to intersect.
   * @returns Array of intersection points, if any.
   */
  intersectObjectByEvent(event: ControllerEvent, obj: THREE.Object3D):
      THREE.Intersection[] {
    return this.intersectObjectByController(event.target, obj);
  }

  /**
   * Finds intersections with an object from either controller.
   * @param obj - The object to intersect.
   * @returns Array of intersection points, if any.
   */
  intersectObject(obj: THREE.Object3D): THREE.Intersection[] {
    // Checks for intersections from the first controller.
    const intersection =
        this.intersectObjectByController(this.controllers[0], obj);
    if (intersection.length > 0) {
      return intersection;
    }
    // Checks for intersections from the second controller if no intersection
    // found.
    return this.intersectObjectByController(this.controllers[1], obj);
  }

  update() {
    if (this.controllersEnabled) {
      for (const controller of this.controllers) {
        this.updateController(controller);
      }
    }
  }

  updateController(controller: Controller) {
    if (controller.userData.connected === false) {
      return;
    }
    controller.updateMatrixWorld();
    this._setRaycasterFromController(controller);
    this.performRaycastOnScene(controller);
    this.updateReticleFromIntersections(controller);
  }


  /**
   * Sets the raycaster's origin and direction from any Object3D that
   * represents a controller. This replaces the non-standard
   * `setFromXRController`.
   * @param controller - The controller to cast a ray from.
   */
  private _setRaycasterFromController(controller: THREE.Object3D) {
    controller.getWorldPosition(this.raycaster.ray.origin);
    MATRIX4.identity().extractRotation(controller.matrixWorld);
    this.raycaster.ray.direction.set(0, 0, -1)
        .applyMatrix4(MATRIX4)
        .normalize();
  }

  updateReticleFromIntersections(controller: Controller) {
    if (!controller.reticle) return;
    const reticle = controller.reticle;
    const intersection =
        this.intersectionsForController.get(controller)?.find(intersection => {
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
    if (!intersection) {
      reticle.visible = false;
      return;
    }
    reticle.visible = true;

    // Here isXRScript is semantically equals to isInteractable.
    if ((intersection.object as Partial<Script>)?.isXRScript) {
      (intersection.object as Script).ux.update(controller, intersection);
    } else if ((intersection.object?.parent as Partial<Script>)?.isXRScript) {
      (intersection.object.parent as Script)
          .ux.update(controller, intersection);
    }

    reticle.intersection = intersection;
    reticle.direction.copy(this.raycaster.ray.direction).normalize();
    reticle.setPoseFromIntersection(intersection);
    reticle.setPressed(controller.userData.selected);
  }

  enableGazeController() {
    this.activeControllers.add(this.gazeController);
    this.gazeController.connect();
  }

  disableGazeController() {
    this.gazeController.disconnect();
    this.activeControllers.remove(this.gazeController);
  }

  disableControllers() {
    this.controllersEnabled = false;
    for (const controller of this.controllers) {
      controller.userData.selected = false
      if (controller.reticle) {
        controller.reticle.visible = false;
        controller.reticle.targetObject = undefined;
      }
    }
  }

  enableControllers() {
    this.controllersEnabled = true;
  }

  // Performs the raycast assuming the raycaster is already set up.
  performRaycastOnScene(controller: Controller) {
    if (!this.intersectionsForController.has(controller)) {
      this.intersectionsForController.set(controller, []);
    }
    const intersections = this.intersectionsForController.get(controller)!;
    intersections.length = 0;
    this.raycaster.intersectObject(this.scene, true, intersections);
  }
};
