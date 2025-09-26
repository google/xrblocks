import * as THREE from 'three';

import type {Controller} from '../input/Controller';
import type {Physics} from '../physics/Physics';
import type {Injectable} from '../utils/DependencyInjection';
import type {Constructor} from '../utils/Types';
import {UX} from '../ux/UX';

export interface SelectEvent {
  target: Controller;
}

export interface ObjectTouchEvent {
  handIndex: number;
  touchPosition: THREE.Vector3;
}

export interface ObjectGrabEvent {
  handIndex: number;
  hand: THREE.Object3D;
}

export interface KeyEvent {
  code: string;
}

/**
 * The Script class facilities development by providing useful life cycle
 * functions similar to MonoBehaviors in Unity.
 *
 * Each Script object is an independent THREE.Object3D entity within the
 * scene graph.
 *
 * See /docs/manual/Scripts.md for the full documentation.
 *
 * It manages user, objects, and interaction between user and objects.
 * See `/templates/0_basic/` for an example to start with.
 *
 *
 * If the class does not extends View, it can still bind the above three
 * function, where the engine ignores whether reticle exists.
 *
 * # Supported (native WebXR) functions to extend:
 *
 * onSelectStart(event)
 * onSelectEnd(event)
 *
 */
export function ScriptMixin<TBase extends Constructor<THREE.Object3D>>(
    base: TBase) {
  return class extends base implements Injectable {
    ux = new UX(this);
    isXRScript = true;

    /**
     * Initializes an instance with XR controllers, grips, hands, raycaster, and
     * default options. We allow all scripts to quickly access its user (e.g.,
     * user.isSelecting(), user.hands), world (e.g., physical depth mesh,
     * lighting estimation, and recognized objects), and scene (the root of
     * three.js's scene graph). If this returns a promise, we will wait for it.
     */
    init(_?: object): void|Promise<void> {}

    /**
     * Runs per frame.
     */
    update(_time?: number, _frame?: XRFrame) {}

    /**
     * Enables depth-aware interactions with physics. See /demos/ballpit
     */
    initPhysics(_physics: Physics): void|Promise<void> {}
    physicsStep() {}

    onXRSessionStarted(_session?: XRSession) {}
    onXRSessionEnded() {}

    onSimulatorStarted() {}

    // Global controller callbacks.
    // See https://developer.mozilla.org/en-US/docs/Web/API/XRInputSourceEvent
    /**
     * Called whenever pinch / mouse click starts, globally.
     * @param _event - event.target holds its controller
     */
    onSelectStart(_event: SelectEvent) {}

    /**
     * Called whenever pinch / mouse click discontinues, globally.
     * @param _event - event.target holds its controller
     */
    onSelectEnd(_event: SelectEvent) {}

    /**
     * Called whenever pinch / mouse click successfully completes, globally.
     * @param _event - event.target holds its controller.
     */
    onSelect(_event: SelectEvent) {}

    /**
     * Called whenever pinch / mouse click is happening, globally.
     */
    onSelecting(_event: SelectEvent) {}

    /**
     * Called on keyboard keypress.
     * @param _event - Event containing `.code` to read the keyboard key.
     */
    onKeyDown(_event: KeyEvent) {}
    onKeyUp(_event: KeyEvent) {}

    /**
     * Called whenever gamepad trigger starts, globally.
     * @param _event - event.target holds its controller.
     */
    onSqueezeStart(_event: SelectEvent) {}
    /**
     * Called whenever gamepad trigger stops, globally.
     * @param _event - event.target holds its controller.
     */
    onSqueezeEnd(_event: SelectEvent) {}

    /**
     * Called whenever gamepad is being triggered, globally.
     */
    onSqueezing(_event: SelectEvent) {}

    /**
     * Called whenever gamepad trigger successfully completes, globally.
     * @param _event - event.target holds its controller.
     */
    onSqueeze(_event: SelectEvent) {}

    // Object-specific controller callbacks.
    /**
     * Called when the controller starts selecting this object the script
     * represents, e.g. View, ModelView.
     * @param _event - event.target holds its controller.
     * @returns Whether the event was handled
     */
    onObjectSelectStart(_event: SelectEvent) {
      return false;
    }
    /**
     * Called when the controller stops selecting this object the script
     * represents, e.g. View, ModelView.
     * @param _event - event.target holds its controller.
     * @returns Whether the event was handled
     */
    onObjectSelectEnd(_event: SelectEvent) {
      return false;  // Whether the event was handled
    }
    /**
     * Called when the controller starts hovering over this object with reticle.
     * @param _controller - An XR controller.
     */
    onHoverEnter(_controller: THREE.Object3D) {}
    /**
     * Called when the controller hovers over this object with reticle.
     * @param _controller - An XR controller.
     */
    onHoverExit(_controller: THREE.Object3D) {}
    /**
     * Called when the controller hovers over this object with reticle.
     * @param _controller - An XR controller.
     */
    onHovering(_controller: THREE.Object3D) {}
    /**
     * Called when a hand's index finger starts touching this object.
     */
    onObjectTouchStart(_event: ObjectTouchEvent) {}
    /**
     * Called every frame that a hand's index finger is touching this object.
     */
    onObjectTouching(_event: ObjectTouchEvent) {}
    /**
     * Called when a hand's index finger stops touching this object.
     */
    onObjectTouchEnd(_event: ObjectTouchEvent) {}
    /**
     * Called when a hand starts grabbing this object (touching + pinching).
     */
    onObjectGrabStart(_event: ObjectGrabEvent) {}
    /**
     * Called every frame a hand is grabbing this object.
     */
    onObjectGrabbing(_event: ObjectGrabEvent) {}
    /**
     * Called when a hand stops grabbing this object.
     */
    onObjectGrabEnd(_event: ObjectGrabEvent) {}

    /**
     * Called when the script is removed from the scene. Opposite of init.
     */
    dispose() {}
  };
}

/**
 * Script manages app logic or interaction between user and objects.
 */
const ScriptMixinObject3D = ScriptMixin(THREE.Object3D);
export class Script<TEventMap extends THREE.Object3DEventMap =
                                          THREE.Object3DEventMap> extends
    ScriptMixinObject3D<TEventMap> {}


/**
 * MeshScript can be constructed with geometry and materials, with
 * `super(geometry, material)`; for direct access to its geometry.
 * MeshScripts hold a UX object that contains its interaction information such
 * as which controller is selecting or touching this object, as well as the
 * exact selected UV / xyz of the reticle, or touched point.
 */
const ScriptMixinMeshScript = ScriptMixin(THREE.Mesh);
export class MeshScript<
    TGeometry extends THREE.BufferGeometry = THREE.BufferGeometry,
                      TMaterial extends
        THREE.Material | THREE.Material[] = THREE.Material | THREE.Material[],
        TEventMap extends THREE.Object3DEventMap =
                              THREE.Object3DEventMap> extends
    ScriptMixinMeshScript<TGeometry, TMaterial, TEventMap> {
  /**
   * {@inheritDoc}
   */
  constructor(geometry?: TGeometry, material?: TMaterial) {
    super(geometry, material);
  }
}
