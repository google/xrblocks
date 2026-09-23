import type * as THREE from 'three';

import type {
  InteractionSourceState,
  ResolvedManipulationAction,
  SelectionCapture,
} from '../../InteractionTypes';
import type {NormalizedManipulationConfig} from '../ManipulationConfig';
import {
  ManipulationAction,
  type ResizeOptions,
  type RotateOptions,
  type ScaleOptions,
  type TranslateOptions,
} from '../ManipulationTypes';

export interface ManipulationDriverSession {
  readonly owner: THREE.Object3D;
  readonly config: NormalizedManipulationConfig;
  readonly primary: {
    readonly capture: SelectionCapture;
    snapshot: InteractionSourceState;
  };
  auxiliary?: InteractionSourceState;
}

export interface TranslateBaseline {
  readonly action: typeof ManipulationAction.Translate;
  readonly worldPosition: THREE.Vector3;
  readonly sourcePosition: THREE.Vector3;
  rayDepth?: number;
  /** Timer time of the last push/pull step, so it advances once per frame. */
  pushPullTime?: number;
  rayPoint?: THREE.Vector3;
  readonly options: TranslateOptions;
  readonly scale: THREE.Vector3;
  readonly cameraDistance?: number;
  /** Distance limits from the viewer, widened to include the start. */
  readonly distanceLimits?: {readonly min: number; readonly max: number};
  readonly scaleOptions: ScaleOptions;
}

export interface RotateBaseline {
  readonly action: typeof ManipulationAction.Rotate;
  readonly localQuaternion: THREE.Quaternion;
  readonly worldQuaternion: THREE.Quaternion;
  readonly sourcePosition: THREE.Vector3;
  readonly sourceOrientationInverse: THREE.Quaternion;
  readonly axis: THREE.Vector3;
  readonly options: Required<Pick<RotateOptions, 'space' | 'sensitivity'>>;
}

export interface ScaleBaseline {
  readonly action: typeof ManipulationAction.Scale;
  readonly scale: THREE.Vector3;
  readonly distance: number;
  readonly options: ScaleOptions;
}

export interface ResizeBaseline {
  readonly action: typeof ManipulationAction.Resize;
  readonly width: number;
  readonly height: number | 'auto';
  /** True when the card had an automatic height at capture. */
  readonly autoHeight: boolean;
  /** Last content height measurement, reused while the width is unchanged. */
  contentFloor?: {readonly width: number; readonly height?: number};
  readonly matrixWorld: THREE.Matrix4;
  readonly inverseMatrixWorld: THREE.Matrix4;
  readonly plane: THREE.Plane;
  readonly pointer: THREE.Vector3;
  /** Normalized card coordinates of the dragged corner, 0 or 1 per axis. */
  readonly corner: THREE.Vector2;
  /** Normalized card coordinates of the card's own anchor. */
  readonly cardAnchor: THREE.Vector2;
  readonly options: Required<Pick<ResizeOptions, 'anchor'>> & {
    readonly minSize: {readonly width: number; readonly height: number};
    readonly maxSize: {readonly width: number; readonly height: number};
    /** Keeps the height at least the content height when no minimum is set. */
    readonly fitContent: boolean;
    readonly preserveAspectRatio: boolean;
  };
}

export type PhaseBaseline =
  | TranslateBaseline
  | RotateBaseline
  | ScaleBaseline
  | ResizeBaseline;

interface ProposalBase {
  apply(): void;
}

export type Proposal = ProposalBase &
  (
    | {
        action: typeof ManipulationAction.Translate;
        point: THREE.Vector3;
        delta: THREE.Vector3;
        position: THREE.Vector3;
        worldPosition: THREE.Vector3;
        scale: THREE.Vector3;
      }
    | {
        action: typeof ManipulationAction.Rotate;
        angle: number;
        quaternion: THREE.Quaternion;
      }
    | {
        action: typeof ManipulationAction.Scale;
        factor: number;
        center: THREE.Vector3;
        scale: THREE.Vector3;
      }
    | {
        action: typeof ManipulationAction.Resize;
        width: number;
        height: number | 'auto';
        position: THREE.Vector3;
      }
  );

export interface ManipulationDriver<
  Baseline extends PhaseBaseline = PhaseBaseline,
> {
  readonly action: ResolvedManipulationAction;
  capture(
    session: ManipulationDriverSession,
    auxiliary?: InteractionSourceState
  ): Baseline | undefined;
  propose(
    session: ManipulationDriverSession,
    baseline: Baseline
  ): Proposal | undefined;
}
