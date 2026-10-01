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
  format: 'xrblocks-interactive-ml';
  version: 1;
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

export function evaluatePredictions(
  examples: {label: string; prediction: Prediction}[]
): Evaluation {
  const result: Evaluation = {
    total: examples.length,
    correct: 0,
    unknown: 0,
    accuracy: 0,
    confusion: {},
  };
  for (const {label, prediction} of examples) {
    assertLabel(label);
    if (prediction.label === label) result.correct++;
    if (prediction.label === null) result.unknown++;
    const row = (result.confusion[label] ??= Object.create(null));
    const predicted = prediction.label ?? '(unknown)';
    row[predicted] = (row[predicted] ?? 0) + 1;
  }
  result.accuracy = result.total ? result.correct / result.total : 0;
  return result;
}

export function assertVector(
  value: unknown,
  length: number
): asserts value is number[] {
  if (
    !Array.isArray(value) ||
    value.length !== length ||
    !value.every(Number.isFinite)
  ) {
    throw new Error(`Expected ${length} finite feature values.`);
  }
}

export function assertLabel(label: string) {
  if (
    typeof label !== 'string' ||
    !label.trim() ||
    label.length > 80 ||
    ['__proto__', 'constructor', 'prototype', '(unknown)'].includes(label)
  ) {
    throw new Error('Use a non-empty label of at most 80 characters.');
  }
}
