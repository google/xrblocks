import * as THREE from 'three';

import {Handedness, JointName} from '../Hands';
import type {User} from '../../core/User';
import type {GestureConfiguration} from './GestureRecognitionOptions';

export type HandLabel = 'left' | 'right';

export const HAND_INDEX_TO_LABEL: Partial<Record<Handedness, HandLabel>> = {
  [Handedness.LEFT]: 'left',
  [Handedness.RIGHT]: 'right',
};

export type JointPositions = Map<JointName, THREE.Vector3>;

export interface HandContext {
  handedness: Handedness;
  handLabel: HandLabel;
  joints: JointPositions;

  getJoint(jointName: JointName): THREE.Vector3 | undefined;
}

export type GestureDetectionResult = {
  confidence: number;
  data?: Record<string, unknown>;
};

export type GestureScoreMap = Record<
  string,
  GestureDetectionResult | undefined
>;

export type HeuristicGestureDetector = (
  context: HandContext,
  config: GestureConfiguration
) => GestureDetectionResult | undefined;

export interface GestureRecognizer {
  init?(): Promise<void>;
  recognize(context: HandContext): GestureScoreMap | Promise<GestureScoreMap>;
  getGestureConfigurations?(): Record<string, GestureConfiguration>;
  dispose?(): void;
}

export interface PoseEstimator {
  init?(dependencies?: {user?: User}): Promise<void>;
  getHandContext(handedness: Handedness): HandContext | null;
  getHandContexts(): Partial<Record<HandLabel, HandContext>>;
  dispose?(): void;
}
