import type * as THREE from 'three';

import type {
  InteractionSourceState,
  ResolvedManipulationAction,
  SelectionCapture,
} from '../../InteractionTypes';
import type {NormalizedManipulationConfig} from '../ManipulationConfig';
import {
  ManipulationAction,
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
  rayPoint?: THREE.Vector3;
  readonly options: TranslateOptions;
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

export type PhaseBaseline = TranslateBaseline | RotateBaseline | ScaleBaseline;

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
