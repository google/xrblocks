import type * as THREE from 'three';

import type {Script} from '../../core/Script';
import type {InteractionSource} from '../InteractionTypes';
import type {FaceCameraMode} from '../../utils/FaceCameraMath';

export type {FaceCameraMode} from '../../utils/FaceCameraMath';

export const ManipulationAction = {
  Translate: 'translate',
  Rotate: 'rotate',
  Scale: 'scale',
  None: 'none',
} as const;

export type ManipulationAction =
  (typeof ManipulationAction)[keyof typeof ManipulationAction];

export interface TranslateOptions {
  faceCamera?: boolean;
  /** Camera-facing rotation mode used while translating. */
  mode?: FaceCameraMode;
  /** Camera-facing rotation smoothing, matching `FaceCamera`. */
  smoothing?: number;
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

export interface ManipulationHandleOptions {
  action?:
    | typeof ManipulationAction.Translate
    | typeof ManipulationAction.Rotate
    | typeof ManipulationAction.Scale
    | typeof ManipulationAction.None;
}

export interface ManipulationOptions {
  actions?: {
    translate?: boolean | TranslateOptions;
    rotate?: boolean | RotateOptions;
    scale?: boolean | ScaleOptions;
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
}

export interface TranslateManipulationEvent extends BaseManipulationEvent {
  readonly action: typeof ManipulationAction.Translate;
  readonly point: THREE.Vector3;
  readonly delta: THREE.Vector3;
  readonly position: THREE.Vector3;
  readonly worldPosition: THREE.Vector3;
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

export type ManipulationEvent =
  | TranslateManipulationEvent
  | RotateManipulationEvent
  | ScaleManipulationEvent;
