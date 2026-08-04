import * as THREE from 'three';
import {XRControllerModelFactory} from 'three/addons/webxr/XRControllerModelFactory.js';
import {XRHandModelFactory} from 'three/addons/webxr/XRHandModelFactory.js';

import {NUM_HANDS} from '../constants';
import {Options} from '../core/Options.js';
import {KeyEvent} from '../core/Script';
import type {
  DirectTouchInput,
  InteractionFrameInput,
  RaySourceInput,
} from '../interaction/InteractionTypes.js';
import {Reticle} from '../interaction/reticle/Reticle.js';

import {ControllerRayVisual} from './components/ControllerRayVisual';
import type {
  Controller,
  ControllerEvent,
  ControllerEventMap,
} from './Controller';
import {GamepadController} from './GamepadController';
import {GazeController} from './GazeController';
import {HeadGestureRecognition} from './headGestures/HeadGestureRecognition';
import {MouseController} from './MouseController';
import {XRSystems} from '../core/components/XRSystems';
import {PinchFilter} from './PinchFilter';

export class ActiveControllers extends THREE.Group {
  type = 'ActiveControllers';
  name = 'Active Controllers';
}

export class Reticles extends THREE.Group {
  type = 'Reticles';
  name = 'Reticles';
}

/**
 * Holds physical input sources and samples their current state each frame.
 */
export class Input {
  options!: Options;
  controllers: Controller[] = [];
  controllerGrips: THREE.Group[] = [];
  hands: THREE.XRHandSpace[] = [];
  /** Completed head gestures, when enabled before initialization. */
  headGestures?: HeadGestureRecognition;
  pivotsEnabled = false;
  gazeController = new GazeController();
  mouseController = new MouseController();
  gamepadController = new GamepadController();
  controllersEnabled = true;
  listeners = new Map();
  private dispatchControllerEvent = (event: ControllerEvent) =>
    this.dispatchEvent(event);
  private pinchFilter = new PinchFilter(this.dispatchControllerEvent);
  private releasedControllers = new Set<Controller>();
  private keyDownListeners = new Set<(event: KeyEvent) => void>();
  private keyUpListeners = new Set<(event: KeyEvent) => void>();
  activeControllers = new ActiveControllers();
  leftController?: Controller;
  rightController?: Controller;
  reticles = new Reticles();
  private ownedReticles = new Set<Reticle>(
    this.gazeController.reticle ? [this.gazeController.reticle] : []
  );
  private readonly raySourceInputs: RaySourceInput[] = [];
  private readonly raySourceSlots = new Map<Controller, RaySourceInput>();
  private readonly directTouchInputs: DirectTouchInput[] = [];
  private readonly directTouchSlots: Array<DirectTouchInput | undefined> = [];
  private readonly interactionFrame: InteractionFrameInput = {
    raySources: this.raySourceInputs,
    directTouches: this.directTouchInputs,
  };
  /**
   * Initializes physical input sources. Only called by Core.
   */
  init({
    systemsGroup,
    options,
    renderer,
  }: {
    systemsGroup: XRSystems;
    options: Options;
    renderer: THREE.WebGLRenderer;
  }) {
    systemsGroup.add(this.activeControllers);

    this.controllersEnabled = options.controllers.enabled;

    this.options = options;

    if (options.headGestures.enabled) {
      this.headGestures = new HeadGestureRecognition();
      systemsGroup.add(this.headGestures);
    }

    if (!options.controllers.enabled) {
      return;
    }

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
    controllers.push(this.gamepadController);
    this.activeControllers.add(this.gamepadController);

    if (options.controllers.enabled) {
      if (options.controllers.visualization) {
        const controllerModelFactory = new XRControllerModelFactory();
        for (let i = 0; i < NUM_HANDS; ++i) {
          controllerGrips.push(renderer.xr.getControllerGrip(i));
          controllerGrips[i].add(
            controllerModelFactory.createControllerModel(controllerGrips[i])
          );
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
              const handModel = handModelFactory.createHandModel(
                this.hands[i],
                'boxes'
              );
              handModel.xb = {...handModel.xb, pointerEvents: 'none'};
              this.hands[i].add(handModel);
            }
          }
          if (options.hands.visualizeMeshes) {
            console.log('Visualize hand meshes.');
            const handModelFactory = new XRHandModelFactory();
            for (let i = 0; i < NUM_HANDS; ++i) {
              const handModel = handModelFactory.createHandModel(
                this.hands[i],
                'mesh'
              );
              handModel.xb = {...handModel.xb, pointerEvents: 'none'};
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
    this.bindSqueezeStart(this.defaultOnSqueezeStart.bind(this));
    this.bindSqueezeEnd(this.defaultOnSqueezeEnd.bind(this));
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
        this.ownedReticles.add(controller.reticle);
        controller.reticle.name = 'Reticle ' + id;
        ++id;
      }
      controller.reticle.visible = false;
      this.reticles.add(controller.reticle);
    }
  }

  /**
   * Default action to handle the start of a selection, setting the selecting
   * state to true.
   */
  defaultOnSelectStart(event: ControllerEvent) {
    const controller = event.target;
    controller.userData.selected = true;
  }

  /**
   * Default action to handle the end of a selection, setting the selecting
   * state to false.
   */
  defaultOnSelectEnd(event: ControllerEvent) {
    const controller = event.target;
    controller.userData.selected = false;
    this.releasedControllers.add(controller);
  }

  defaultOnSqueezeStart(event: ControllerEvent) {
    const controller = event.target;
    controller.userData.squeezing = true;
    this.defaultOnSelectStart(event);
  }

  defaultOnSqueezeEnd(event: ControllerEvent) {
    const controller = event.target;
    controller.userData.squeezing = false;
    this.defaultOnSelectEnd(event);
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
    if (controller.userData.selected) {
      controller.userData.selected = false;
      this.dispatchEvent({
        type: 'selectend',
        target: controller,
        data: event.data,
        isCustom: true,
      } as unknown as ControllerEvent);
    }
    if (controller.reticle) {
      controller.reticle.visible = false;
    }
    this.releasedControllers.delete(controller);
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
    listener: (event: ControllerEvent) => void
  ) {
    for (const controller of this.controllers) {
      this.pinchFilter.setupControllerForType(controller, listenerName);
    }
    if (!this.listeners.has(listenerName)) {
      this.listeners.set(listenerName, []);
    }
    this.listeners.get(listenerName).push(listener);
  }

  unbindListener(
    listenerName: keyof ControllerEventMap,
    listener: (event: ControllerEvent) => void
  ) {
    if (this.listeners.has(listenerName)) {
      const list = this.listeners.get(listenerName)!;
      const index = list.indexOf(listener);
      if (index !== -1) {
        list.splice(index, 1);
      }
      if (list.length === 0) {
        for (const controller of this.controllers) {
          this.pinchFilter.removeControllerForType(controller, listenerName);
        }
      }
    }
  }

  dispatchEvent(event: ControllerEvent) {
    if (this.pinchFilter.shouldFilterEvent(event)) {
      return;
    }
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
    if (this.keyDownListeners.has(event)) return;
    this.keyDownListeners.add(event);
    window.addEventListener('keydown', event);
  }

  bindKeyUp(event: (event: KeyEvent) => void) {
    if (this.keyUpListeners.has(event)) return;
    this.keyUpListeners.add(event);
    window.addEventListener('keyup', event);
  }

  unbindKeyDown(event: (event: KeyEvent) => void) {
    this.keyDownListeners.delete(event);
    window.removeEventListener('keydown', event);
  }

  unbindKeyUp(event: (event: KeyEvent) => void) {
    this.keyUpListeners.delete(event);
    window.removeEventListener('keyup', event);
  }

  /** Samples current controller, button, and direct-touch state. */
  sampleSources() {
    if (this.controllersEnabled) {
      for (const controller of this.controllers) {
        if (controller.userData.connected !== true) continue;
        controller.updatePose?.();
        this.pinchFilter.updateController(controller);
      }
    }
    this.updateDirectTouchInputs();
  }

  /** Returns the complete physical source state sampled this frame. */
  getFrame(): InteractionFrameInput {
    this.raySourceInputs.length = 0;
    if (this.controllersEnabled) {
      for (const controller of this.controllers) {
        if (controller.userData.connected !== true) continue;
        let input = this.raySourceSlots.get(controller);
        if (!input) {
          input = {
            controller,
            sourceType: this.getRaySourceType(controller),
            ray: new THREE.Ray(),
            selected: false,
            position: new THREE.Vector3(),
            orientation: new THREE.Quaternion(),
          };
          this.raySourceSlots.set(controller, input);
        }
        const position = input.position!;
        const orientation = input.orientation!;
        controller.getWorldPosition(position);
        controller.getWorldQuaternion(orientation);
        input.sourceType = this.getRaySourceType(controller);
        input.ray.origin.copy(position);
        input.ray.direction
          .set(0, 0, -1)
          .applyQuaternion(orientation)
          .normalize();
        input.selected = controller.userData.selected === true;
        input.released = this.releasedControllers.delete(controller);
        this.raySourceInputs.push(input);
      }
    }
    return this.interactionFrame;
  }

  private getRaySourceType(
    controller: Controller
  ): RaySourceInput['sourceType'] {
    if (controller === this.mouseController) return 'mouse';
    if (controller === this.gazeController) return 'gaze';
    if (controller.inputSource?.hand) return 'hand-ray';
    return 'controller-ray';
  }

  private updateDirectTouchInputs() {
    this.directTouchInputs.length = 0;
    for (let handIndex = 0; handIndex < NUM_HANDS; handIndex++) {
      const controller = this.controllers[handIndex];
      const indexTip = this.hands[handIndex]?.joints?.['index-finger-tip'];
      if (!controller || !indexTip) continue;
      let input = this.directTouchSlots[handIndex];
      if (!input) {
        input = {
          controller,
          handIndex,
          point: new THREE.Vector3(),
          orientation: new THREE.Quaternion(),
          selected: false,
        };
        this.directTouchSlots[handIndex] = input;
      }
      input.controller = controller;
      input.hand = this.hands[handIndex]?.joints?.wrist;
      indexTip.getWorldPosition(input.point);
      controller.getWorldQuaternion(input.orientation!);
      input.selected = controller.userData.selected === true;
      this.directTouchInputs.push(input);
    }
  }

  enableGazeController() {
    this.activeControllers.add(this.gazeController);
    this.gazeController.connect();
  }

  disableGazeController() {
    this.gazeController.disconnect();
    this.activeControllers.remove(this.gazeController);
  }

  private registerController(controller: Controller) {
    if (this.controllers.includes(controller)) return;
    this.controllers.push(controller);

    if (controller.reticle) {
      controller.reticle.visible = false;
      this.reticles.add(controller.reticle);
    }

    this.pinchFilter.setupController(controller, this.listeners.keys());
  }

  enableController(controller: Controller) {
    this.registerController(controller);
    this.activeControllers.add(controller as unknown as THREE.Object3D);
    (controller as unknown as {connect?: () => void}).connect?.();
  }

  disableController(controller: Controller) {
    (controller as unknown as {disconnect?: () => void}).disconnect?.();
    this.activeControllers.remove(controller as unknown as THREE.Object3D);
  }

  disableControllers() {
    this.controllersEnabled = false;
    for (const controller of this.controllers) {
      controller.userData.selected = false;
      this.releasedControllers.delete(controller);
      if (controller.reticle) {
        controller.reticle.visible = false;
        controller.reticle.targetObject = undefined;
      }
    }
  }

  enableControllers() {
    this.controllersEnabled = true;
  }

  dispose() {
    for (const listener of this.keyDownListeners) {
      window.removeEventListener('keydown', listener);
    }
    for (const listener of this.keyUpListeners) {
      window.removeEventListener('keyup', listener);
    }
    this.keyDownListeners.clear();
    this.keyUpListeners.clear();
    this.pinchFilter.dispose(this.controllers);
    this.listeners.clear();
    for (const controller of new Set([
      ...this.controllers,
      this.gazeController,
    ])) {
      if (controller.reticle && this.ownedReticles.has(controller.reticle)) {
        controller.reticle = undefined;
      }
    }
    for (const reticle of this.ownedReticles) reticle.dispose();
    this.ownedReticles.clear();
    this.reticles.clear();
    this.raySourceInputs.length = 0;
    this.raySourceSlots.clear();
    this.directTouchInputs.length = 0;
    this.directTouchSlots.length = 0;
  }
}
