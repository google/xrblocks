import { ARTIFACT_VERSION, MODEL_FORMAT } from "./constants.js";
//#region src/addons/interactive-ml/Types.d.ts
export type HandLabel = 'left' | 'right';
/** A copied hand pose with a timestamp in milliseconds. */
export interface HandFrame {
  hand: HandLabel;
  timeMs: number;
  pose: number[];
}
export interface Prediction {
  /** Null means the sample did not pass the acceptance thresholds. */
  label: string | null;
  /** Similarity/softmax score, not a calibrated probability. */
  score: number;
  scores: Record<string, number>;
}
export interface TrainingOptions {
  signal?: AbortSignal;
  onProgress?: (fraction: number) => void;
  epochs?: number;
}
export interface ClassifierData {
  labels: string[];
  mean: number[];
  scale: number[];
  weights: number[][];
  bias: number[];
  centers: number[][];
  radii: number[];
}
export interface ModelArtifact {
  format: typeof MODEL_FORMAT;
  version: typeof ARTIFACT_VERSION;
  kind: 'hand-pose' | 'sound';
  featureId: string;
  threshold: number;
  classifier: ClassifierData;
}
export interface Evaluation {
  total: number;
  correct: number;
  unknown: number;
  accuracy: number;
  confusion: Record<string, Record<string, number>>;
}
export declare function evaluatePredictions(examples: {
  label: string;
  prediction: Prediction;
}[]): Evaluation;
export declare function assertVector(value: unknown, length: number): asserts value is number[];
export declare function assertLabel(label: string): void;
//#endregion