import * as THREE from 'three';

import type {InteractionSource} from '../interaction/InteractionTypes';
import type {ManipulationEvent} from '../interaction/manipulation/ManipulationTypes';
import type {Physics} from '../physics/Physics';
import type {Injectable} from '../utils/DependencyInjection';
import type {Constructor} from '../utils/Types';
import {markDefaultScriptMethods} from './ScriptHooks';

export interface SelectEvent {
  readonly source: InteractionSource;
  readonly target?: THREE.Object3D;
  readonly currentTarget?: Script;
  readonly surface?: THREE.Object3D;
}

export type SelectionEndReason =
  | 'released'
  | 'released-outside'
  | 'source-lost'
  | 'pointer-cancel'
  | 'removed'
  | 'hidden'
  | 'disabled';

export interface SelectEndEvent extends SelectEvent {
  readonly completed: boolean;
  readonly reason: SelectionEndReason;
}

/** Event sent after a captured selection is held past the long-select delay. */
export interface LongSelectEvent extends SelectEvent {
  /** How long the selection has been held, in seconds. */
  duration: number;
}

export interface ObjectTouchEvent {
  readonly source: InteractionSource;
  readonly target: THREE.Object3D;
  readonly currentTarget?: Script;
  readonly surface: THREE.Object3D;
  readonly handIndex: number;
  readonly hand?: THREE.Object3D;
  readonly touchPosition: THREE.Vector3;
}

export interface ObjectTouchStartEvent extends ObjectTouchEvent {
  readonly defaultPrevented: boolean;
  preventDefault(): void;
}

export interface ObjectGrabEvent {
  readonly source: InteractionSource;
  readonly target: THREE.Object3D;
  readonly currentTarget?: Script;
  readonly surface: THREE.Object3D;
  readonly handIndex: number;
  readonly hand: THREE.Object3D;
  readonly touchPosition: THREE.Vector3;
}

export interface HoverEvent extends SelectEvent {
  readonly intersection?: THREE.Intersection;
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
 * # Supported interaction functions to extend:
 *
 * onSelectStart(event)
 * onSelectEnd(event)
 *
 */
export function ScriptMixin<TBase extends Constructor<THREE.Object3D>>(
  base: TBase
) {
  class MixedScript extends base implements Injectable {
    isXRScript = true;

    /**
     * Initializes an instance with XR controllers, grips, hands, and default
     * options. We allow all scripts to quickly access its user (e.g.,
     * user.isSelecting(), user.hands), world (e.g., physical depth mesh,
     * lighting estimation, and recognized objects), and scene (the root of
     * three.js's scene graph). If this returns a promise, we will wait for it.
     */
    init(_?: object): void | Promise<void> {}

    /**
     * Runs per frame.
     */
    update(_time?: number, _frame?: XRFrame) {}

    /**
     * Enables depth-aware interactions with physics. See /demos/ballpit
     */
    initPhysics(_physics: Physics): void | Promise<void> {}
    physicsStep() {}

    onXRSessionStarted(_session?: XRSession) {}
    onXRSessionEnded() {}

    onSimulatorStarted() {}

    // Global controller callbacks.
    // See https://developer.mozilla.org/en-US/docs/Web/API/XRInputSourceEvent
    /**
     * Called whenever pinch / mouse click starts, globally.
     * @param _event - The interaction source and optional captured target.
     */
    onSelectStart(_event: SelectEvent) {}

    /**
     * Called whenever pinch / mouse click discontinues, globally.
     * @param _event - The completed state and end reason.
     */
    onSelectEnd(_event: SelectEndEvent) {}

    /**
     * Called whenever pinch / mouse click successfully completes, globally.
     * @param _event - The interaction source and completed target.
     */
    onSelect(_event: SelectEvent) {}

    /**
     * Called whenever pinch / mouse click is happening, globally.
     */
    onSelecting(_event: SelectEvent) {}

    /** Called when an object selection reaches the long-select delay. */
    onLongSelect(_event: LongSelectEvent) {}

    /**
     * Called on keyboard keypress.
     * @param _event - Event containing `.code` to read the keyboard key.
     */
    onKeyDown(_event: KeyEvent) {}
    onKeyUp(_event: KeyEvent) {}

    /**
     * Called whenever gamepad trigger starts, globally.
     * @param _event - `event.source.controller` identifies the controller.
     */
    onSqueezeStart(_event: SelectEvent) {}
    /**
     * Called whenever gamepad trigger stops, globally.
     * @param _event - `event.source.controller` identifies the controller.
     */
    onSqueezeEnd(_event: SelectEvent) {}

    /**
     * Called whenever gamepad is being triggered, globally.
     */
    onSqueezing(_event: SelectEvent) {}

    /**
     * Called whenever gamepad trigger successfully completes, globally.
     * @param _event - `event.source.controller` identifies the controller.
     */
    onSqueeze(_event: SelectEvent) {}

    // Object-specific controller callbacks.
    /**
     * Called when a source starts selecting the object this Script represents.
     * @param _event - `event.target` is the logical object and
     * `event.source.controller` identifies the controller.
     * @returns Whether the event was handled. If true, the event will not bubble up.
     */
    onObjectSelectStart(_event: SelectEvent): boolean | void {}
    /**
     * Called when a source stops selecting the object this Script represents.
     * @param _event - The completed state and end reason.
     * @returns Whether the event was handled. If true, the event will not bubble up.
     */
    onObjectSelectEnd(_event: SelectEndEvent): boolean | void {}
    /**
     * Called once when a captured selection is held for the long-select delay.
     * Manipulation captures do not emit this callback.
     * @param _event - The controller and completed hold duration.
     * @returns Whether the event was handled. If true, the event will not bubble up.
     */
    onObjectLongSelect(_event: LongSelectEvent): boolean | void {}
    /**
     * Called for each phase of an automatic object manipulation.
     * Returning true stops propagation to later Script ancestors. Calling
     * preventDefault() on a start event suppresses the automatic action.
     */
    onObjectManipulate(_event: ManipulationEvent): boolean | void {}
    /**
     * Called when a source starts hovering over this object.
     * @param _event - The hover source, target, surface, and intersection.
     * @returns Whether the event was handled. If true, the event will not bubble up.
     */
    onHoverEnter(_event: HoverEvent): boolean | void {}
    /**
     * Called when a source stops hovering over this object.
     * @param _event - The hover source, target, surface, and intersection.
     * @returns Whether the event was handled. If true, the event will not bubble up.
     */
    onHoverExit(_event: HoverEvent): boolean | void {}
    /**
     * Called while a source hovers over this object.
     * @param _event - The hover source, target, surface, and intersection.
     * @returns Whether the event was handled. If true, the event will not bubble up.
     */
    onHovering(_event: HoverEvent): boolean | void {}
    /**
     * Called when a hand's index finger starts touching this object.
     */
    onObjectTouchStart(_event: ObjectTouchStartEvent): boolean | void {}
    /**
     * Called every frame that a hand's index finger is touching this object.
     */
    onObjectTouching(_event: ObjectTouchEvent): boolean | void {}
    /**
     * Called when a hand's index finger stops touching this object.
     */
    onObjectTouchEnd(_event: ObjectTouchEvent): boolean | void {}
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
  }

  markDefaultScriptMethods(MixedScript.prototype);
  return MixedScript;
}

/**
 * Script manages app logic or interaction between user and objects.
 */
const ScriptMixinObject3D = ScriptMixin(THREE.Object3D);
export class Script<
  TEventMap extends THREE.Object3DEventMap = THREE.Object3DEventMap,
> extends ScriptMixinObject3D<TEventMap> {}

/**
 * MeshScript can be constructed with geometry and materials, with
 * `super(geometry, material)`; for direct access to its geometry.
 * MeshScripts hold geometry and materials while using the Script lifecycle.
 */
const ScriptMixinMeshScript = ScriptMixin(THREE.Mesh);
export class MeshScript<
  TGeometry extends THREE.BufferGeometry = THREE.BufferGeometry,
  TMaterial extends THREE.Material | THREE.Material[] =
    | THREE.Material
    | THREE.Material[],
  TEventMap extends THREE.Object3DEventMap = THREE.Object3DEventMap,
> extends ScriptMixinMeshScript<TGeometry, TMaterial, TEventMap> {
  /**
   * {@inheritDoc}
   */
  constructor(geometry?: TGeometry, material?: TMaterial) {
    super(geometry, material);
  }
}
