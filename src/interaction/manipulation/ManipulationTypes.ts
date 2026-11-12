import type * as THREE from 'three';

import type {Script} from '../../core/Script';
import type {InteractionSource} from '../InteractionTypes';
import type {FaceCameraMode} from '../../utils/FaceCameraMath';

export type {FaceCameraMode} from '../../utils/FaceCameraMath';

export const ManipulationAction = {
  Translate: 'translate',
  Rotate: 'rotate',
  Scale: 'scale',
  Resize: 'resize',
  None: 'none',
} as const;

export type ManipulationAction =
  (typeof ManipulationAction)[keyof typeof ManipulationAction];

export interface TranslateOptions {
  faceCamera?: boolean;
  /** Camera-facing rotation mode used while translating. */
  mode?: FaceCameraMode;
  /** Half-height of the upright region used by capsule mode, in meters. */
  capsuleHalfHeight?: number;
  /** Camera-facing rotation smoothing, matching `FaceCamera`. */
  smoothing?: number;
  /**
   * Smooths the pointer ray that drives a ray move. Small hand movements as
   * the pinch starts do not move the owner, then the ray blends in and eases
   * toward the pointer, catching up faster when the hand reverses direction.
   * Defaults to false.
   */
  raySmoothing?: boolean;
  /**
   * Scales the owner with its distance from the camera while translating,
   * so owners look larger when pulled closer and smaller when pushed away. A
   * ray grab point keeps its place on the owner as it scales. Clamped by the
   * Scale action limits.
   */
  scaleWithDistance?: boolean;
  /**
   * Pushes the owner away or pulls it closer along a controller ray with the
   * thumbstick while translating: forward pushes, back pulls.
   */
  pushPull?: boolean | PushPullOptions;
  /** Closest the owner can be moved to the viewer, in meters. */
  minDistance?: number;
  /** Farthest the owner can be moved from the viewer, in meters. */
  maxDistance?: number;
}

export interface PushPullOptions {
  /**
   * Exponential distance change rate at full deflection: the distance is
   * multiplied by e^speed per second. Defaults to 1.5.
   */
  speed?: number;
}

export interface RotateOptions {
  axis?: 'x' | 'y' | 'z' | THREE.Vector3Like;
  space?: 'local' | 'world';
  sensitivity?: number;
}

export interface ScaleOptions {
  minScale?: number | THREE.Vector3Like;
  maxScale?: number | THREE.Vector3Like;
}

export interface ResizeSize {
  width?: number;
  height?: number;
}

/** Options for resizing a `UICard` by dragging one of its corners. */
export interface ResizeOptions {
  /**
   * Point kept fixed while a corner is dragged. `center` grows the card around
   * its center, matching Android XR and Quest panels. `opposite` keeps the
   * corner opposite the dragged one in place. Defaults to `center`.
   */
  anchor?: 'center' | 'opposite';
  /**
   * Minimum card size in meters. Defaults to 0.1 meters per axis. Without an
   * explicit `width`, the card never gets narrower than its content allows,
   * and without an explicit `height` it never gets shorter than its content
   * needs at the current width. Set `height` when the card scrolls its own
   * content.
   */
  minSize?: ResizeSize;
  /** Maximum card size in meters. Defaults to 10 meters per axis. */
  maxSize?: ResizeSize;
  /** Keeps the card's width-to-height ratio while resizing. Defaults to false. */
  preserveAspectRatio?: boolean;
  /**
   * Eases the card toward the dragged size instead of following the pointer
   * exactly, with the same ease as `raySmoothing`. Defaults to true on a
   * `UICard`.
   */
  smoothing?: boolean;
  /**
   * Lets a corner dragged past `minSize` or `maxSize` push the card's edge
   * slightly past the limit, and the size snaps back to the limit on release.
   * The release's `update` and `end` events report the snapped size. Width and
   * height overshoot independently. Content floors and aspect-locked
   * resizes stay hard limits. Defaults to true on a `UICard`.
   */
  overshoot?: boolean;
}

export interface ManipulationHandleOptions {
  action?:
    | typeof ManipulationAction.Translate
    | typeof ManipulationAction.Rotate
    | typeof ManipulationAction.Scale
    | typeof ManipulationAction.Resize
    | typeof ManipulationAction.None;
}

export interface ManipulationOptions {
  actions?: {
    translate?: boolean | TranslateOptions;
    rotate?: boolean | RotateOptions;
    scale?: boolean | ScaleOptions;
    /** Corner resize. Applies only to `UICard` owners. */
    resize?: boolean | ResizeOptions;
  };
  handle?: ManipulationHandleOptions;
}

export type ManipulationPhase = 'start' | 'update' | 'end' | 'cancel';

export interface BaseManipulationEvent {
  readonly phase: ManipulationPhase;
  readonly action: ManipulationAction;
  readonly source: InteractionSource;
  readonly sources: readonly InteractionSource[];
  readonly target: THREE.Object3D;
  readonly surface: THREE.Object3D;
  readonly owner: THREE.Object3D;
  readonly currentTarget: Script;
  readonly defaultPrevented: boolean;
  preventDefault(): void;
  stopPropagation(): void;
}

export interface TranslateManipulationEvent extends BaseManipulationEvent {
  readonly action: typeof ManipulationAction.Translate;
  readonly point: THREE.Vector3;
  readonly delta: THREE.Vector3;
  readonly position: THREE.Vector3;
  readonly worldPosition: THREE.Vector3;
  /** Proposed local scale, changed only by `scaleWithDistance`. */
  readonly scale: THREE.Vector3;
}

export interface RotateManipulationEvent extends BaseManipulationEvent {
  readonly action: typeof ManipulationAction.Rotate;
  readonly angle: number;
  readonly quaternion: THREE.Quaternion;
}

export interface ScaleManipulationEvent extends BaseManipulationEvent {
  readonly action: typeof ManipulationAction.Scale;
  readonly factor: number;
  readonly center: THREE.Vector3;
  readonly scale: THREE.Vector3;
}

export interface ResizeManipulationEvent extends BaseManipulationEvent {
  readonly action: typeof ManipulationAction.Resize;
  /**
   * Proposed card size in meters. An automatic height stays `'auto'` until the
   * resize actually changes the card's size, then becomes fixed. Before the
   * card's first layout, only the width can change.
   */
  readonly width: number;
  readonly height: number | 'auto';
  /** Proposed local position that keeps the resize anchor in place. */
  readonly position: THREE.Vector3;
}

export type ManipulationEvent =
  | TranslateManipulationEvent
  | RotateManipulationEvent
  | ScaleManipulationEvent
  | ResizeManipulationEvent;
