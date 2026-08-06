import * as THREE from 'three';

import type {RaycastMode, ReticleOptions} from '../core/Options.js';
import type {
  LongSelectEvent,
  Script,
  SelectEndEvent,
  SelectEvent,
} from '../core/Script.js';
import type {Controller} from '../input/Controller.js';
import type {
  ManipulationAction,
  ManipulationHandleOptions,
  ManipulationEvent,
  ManipulationOptions,
} from './manipulation/ManipulationTypes.js';

export type PointerEvents = 'auto' | 'none';
export type ReticleMode = 'auto' | 'surface' | 'hidden';

export interface XBObjectOptions {
  /** Whether this object and its descendants participate in pointer hits. */
  pointerEvents?: PointerEvents;
  interactionEnabled?: boolean;
  reticleMode?: ReticleMode;
  manipulation?: boolean | ManipulationOptions;
  manipulationHandle?: ManipulationHandleOptions | 'none';
}

declare module 'three' {
  interface Object3D {
    xb?: XBObjectOptions;
  }
}

export type InteractionSourceType =
  | 'mouse'
  | 'controller-ray'
  | 'hand-ray'
  | 'direct-touch'
  | 'gaze'
  | 'simulator';

export type RaySourceType = Exclude<InteractionSourceType, 'direct-touch'>;

export interface InteractionSource {
  readonly type: InteractionSourceType;
  readonly handedness: 'left' | 'right' | 'none';
  readonly controller: Controller;
}

export interface RaySourceInput {
  controller: Controller;
  sourceType: RaySourceType;
  ray: THREE.Ray;
  /** Optional raw hits supplied by an isolated Interaction adapter. */
  intersections?: readonly THREE.Intersection[];
  selected: boolean;
  released?: boolean;
  position?: THREE.Vector3;
  orientation?: THREE.Quaternion;
}

export interface DirectTouchInput {
  controller: Controller;
  handIndex: number;
  hand?: THREE.Object3D;
  point: THREE.Vector3;
  selected: boolean;
  orientation?: THREE.Quaternion;
}

/** All physical interaction input sampled for one engine frame. */
export interface InteractionFrameInput {
  readonly raySources: readonly RaySourceInput[];
  readonly directTouches: readonly DirectTouchInput[];
}

/** Mutable internal storage for one controller's current logical source. */
export class InteractionSourceState {
  source: InteractionSource;
  sourceType: InteractionSourceType = 'controller-ray';
  readonly position = new THREE.Vector3();
  readonly orientation = new THREE.Quaternion();
  private readonly rayValue = new THREE.Ray();
  ray?: THREE.Ray;
  selected = false;
  selectionProgress?: number;

  constructor(readonly controller: Controller) {
    this.source = getInteractionSource(controller, this.sourceType);
  }

  updateRay(input: RaySourceInput): this {
    this.source = getInteractionSource(this.controller, input.sourceType);
    this.sourceType = input.sourceType;
    if (input.position) this.position.copy(input.position);
    else this.controller.getWorldPosition(this.position);
    if (input.orientation) this.orientation.copy(input.orientation);
    else this.controller.getWorldQuaternion(this.orientation);
    this.rayValue.copy(input.ray);
    this.ray = this.rayValue;
    this.selected = input.sourceType === 'gaze' ? false : input.selected;
    this.selectionProgress = undefined;
    return this;
  }

  updateTouch(point: THREE.Vector3, orientation?: THREE.Quaternion): this {
    this.source = getInteractionSource(this.controller, 'direct-touch');
    this.sourceType = 'direct-touch';
    this.position.copy(point);
    if (orientation) this.orientation.copy(orientation);
    else this.controller.getWorldQuaternion(this.orientation);
    this.ray = undefined;
    this.selected = true;
    this.selectionProgress = undefined;
    return this;
  }

  copyFrom(source: InteractionSourceState): this {
    this.source = source.source;
    this.sourceType = source.sourceType;
    this.position.copy(source.position);
    this.orientation.copy(source.orientation);
    if (source.ray) {
      this.rayValue.copy(source.ray);
      this.ray = this.rayValue;
    } else {
      this.ray = undefined;
    }
    this.selected = source.selected;
    this.selectionProgress = source.selectionProgress;
    return this;
  }
}

export interface ResolvedRay {
  readonly intersection: THREE.Intersection;
  /** Physical object that supplied the hit geometry. */
  readonly hitObject: THREE.Object3D;
  /** Public object that owns the hit. */
  readonly surface: THREE.Object3D;
  readonly target?: THREE.Object3D;
  readonly scriptPath: readonly Script[];
  readonly objectPath: readonly THREE.Object3D[];
  readonly reticleMode: ReticleMode;
  readonly semanticControl?: THREE.Object3D;
  readonly manipulation?: ManipulationResolution;
}

export interface SelectionCapture {
  readonly source: Controller;
  readonly publicSource: InteractionSource;
  readonly target: THREE.Object3D;
  readonly surface: THREE.Object3D;
  readonly owner: THREE.Object3D;
  readonly point: THREE.Vector3;
  readonly uv?: THREE.Vector2;
  readonly scriptPath: readonly Script[];
  readonly manipulation?: ManipulationResolution;
}

export type ResolvedManipulationAction = Exclude<ManipulationAction, 'none'>;

export interface ManipulationResolution {
  readonly owner: THREE.Object3D;
  readonly action?: ResolvedManipulationAction;
  readonly handle?: THREE.Object3D;
}

export type TargetedInteractionHook =
  | 'onObjectSelectStart'
  | 'onObjectSelectEnd'
  | 'onObjectLongSelect'
  | 'onObjectTouchStart'
  | 'onObjectTouching'
  | 'onObjectTouchEnd'
  | 'onObjectGrabStart'
  | 'onObjectGrabbing'
  | 'onObjectGrabEnd'
  | 'onHoverEnter'
  | 'onHovering'
  | 'onHoverExit';

export type GlobalInteractionHook =
  | 'onSelectStart'
  | 'onSelecting'
  | 'onSelect'
  | 'onSelectEnd'
  | 'onLongSelect';

export type GlobalInteractionEvent<Hook extends GlobalInteractionHook> =
  Hook extends 'onSelectEnd'
    ? SelectEndEvent
    : Hook extends 'onLongSelect'
      ? LongSelectEvent
      : SelectEvent;

/**
 * The only Script-facing seam. The implementation applies the existing Script
 * exception policy to each invocation.
 */
export interface InteractionCallbackDispatch {
  isScript(object: THREE.Object3D): boolean;
  hasTargetHandler(
    object: THREE.Object3D,
    sourceType: InteractionSourceType
  ): boolean;
  hasTargetHook(object: THREE.Object3D, hook: TargetedInteractionHook): boolean;
  invokeTarget(
    script: THREE.Object3D,
    hook: TargetedInteractionHook,
    argument: unknown
  ): unknown;
  invokeSemantic(object: THREE.Object3D, callback: () => void): void;
  invokeGlobal<Hook extends GlobalInteractionHook>(
    hook: Hook,
    event: GlobalInteractionEvent<Hook>
  ): void;
  invokeManipulation(script: Script, event: ManipulationEvent): boolean;
}

export interface ReticlePresentationObserver {
  present(
    snapshot: InteractionSourceState,
    resolved: ResolvedRay | undefined
  ): void;
  clear(controller: Controller): void;
}

export interface InteractionDependencies {
  callbacks: InteractionCallbackDispatch;
  scene?: THREE.Scene;
  raycastMode?: RaycastMode;
  camera?: THREE.Camera;
  timer?: THREE.Timer;
  reticle?: ReticlePresentationObserver;
  reticleOptions?: ReticleOptions;
  longSelectDuration?: number;
}

const PUBLIC_SOURCES = new WeakMap<
  Controller,
  Map<InteractionSourceType, InteractionSource>
>();

/** Returns one stable public source for a controller and modality. */
export function getInteractionSource(
  controller: Controller,
  type: InteractionSourceType
): InteractionSource {
  let byType = PUBLIC_SOURCES.get(controller);
  if (!byType) {
    byType = new Map();
    PUBLIC_SOURCES.set(controller, byType);
  }
  const source = byType.get(type);
  if (source) return source;
  const created: InteractionSource = Object.freeze({
    type,
    controller,
    get handedness(): InteractionSource['handedness'] {
      const value = controller.inputSource?.handedness;
      return value === 'left' || value === 'right' ? value : 'none';
    },
  });
  byType.set(type, created);
  return created;
}
