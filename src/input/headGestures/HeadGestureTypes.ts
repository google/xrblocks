import * as THREE from 'three';

export type HeadGestureConfiguration = {
  enabled: boolean;
  /** Detector-specific sensitivity. Built-in heuristics interpret this as radians. */
  threshold?: number;
};

export type HeadPoseSample = {
  timestamp: number;
  position: THREE.Vector3;
  orientation: THREE.Quaternion;
};

export interface HeadGestureContext {
  readonly samples: readonly HeadPoseSample[];
}

export type HeadGestureDetectionResult = {
  confidence: number;
  data?: Record<string, unknown>;
};

export type HeadGestureScoreMap = Record<
  string,
  HeadGestureDetectionResult | undefined
>;

export type HeuristicHeadGestureDetector = (
  context: HeadGestureContext,
  config: HeadGestureConfiguration
) => HeadGestureDetectionResult | undefined;

export interface HeadGestureRecognizer {
  init?(): Promise<void>;
  recognize(
    context: HeadGestureContext
  ): HeadGestureScoreMap | Promise<HeadGestureScoreMap>;
  getGestureConfigurations?(): Record<string, HeadGestureConfiguration>;
  setGestureConfig?(name: string, config: HeadGestureConfiguration): void;
  dispose?(): void;
}
