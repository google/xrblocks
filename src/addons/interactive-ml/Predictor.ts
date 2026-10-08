import {
  MIN_CLASSES,
  MAX_CLASSES,
  MAX_FEATURE_ID_LENGTH,
  MAX_FEATURE_DIMENSIONS,
  HAND_FEATURE_ID,
  HAND_FEATURE_SIZE,
  MODEL_FORMAT,
  ARTIFACT_VERSION,
} from './constants';
import {poseFeatures} from './HandFeatures';
import {probabilities} from './Learning';
import {decodeTFLite, encodeTFLite} from './TFLite';
import {assertLabel, assertVector} from './Types';
import type {HandFrame, ModelArtifact, Prediction} from './Types';

/** Validates the complete format before a model can replace an active predictor. */
export function validateModel(value: unknown): ModelArtifact {
  if (!value || typeof value !== 'object') throw new Error('Invalid model.');
  const m = value as ModelArtifact;
  if (
    m.format !== MODEL_FORMAT ||
    m.version !== ARTIFACT_VERSION ||
    !['hand-pose', 'sound'].includes(m.kind) ||
    typeof m.featureId !== 'string' ||
    !m.featureId ||
    m.featureId.length > MAX_FEATURE_ID_LENGTH ||
    !Number.isFinite(m.threshold) ||
    m.threshold < 0 ||
    m.threshold > 1
  ) {
    throw new Error('Unsupported model format or settings.');
  }
  if (m.kind !== 'sound' && m.featureId !== HAND_FEATURE_ID)
    throw new Error('Unsupported hand features.');
  const c = m.classifier;
  if (
    !c ||
    !Array.isArray(c.labels) ||
    c.labels.length < MIN_CLASSES ||
    c.labels.length > MAX_CLASSES ||
    new Set(c.labels).size !== c.labels.length ||
    !Array.isArray(c.mean) ||
    c.mean.length < 1 ||
    c.mean.length > MAX_FEATURE_DIMENSIONS ||
    (m.kind === 'hand-pose' && c.mean.length !== HAND_FEATURE_SIZE)
  )
    throw new Error('Invalid classifier.');
  c.labels.forEach(assertLabel);
  const d = c.mean.length;
  assertVector(c.mean, d);
  assertVector(c.scale, d);
  assertVector(c.bias, c.labels.length);
  assertVector(c.radii, c.labels.length);
  if (
    c.scale.some((v) => v <= 0) ||
    c.radii.some((v) => v <= 0) ||
    !Array.isArray(c.weights) ||
    c.weights.length !== c.labels.length ||
    !Array.isArray(c.centers) ||
    c.centers.length !== c.labels.length
  )
    throw new Error('Invalid classifier dimensions.');
  c.weights.forEach((row) => assertVector(row, d));
  c.centers.forEach((row) => assertVector(row, d));
  return structuredClone(m);
}

/** Immutable weights; safe to share between independent input streams. */
export class Predictor {
  private model: ModelArtifact | null;
  constructor(artifact: unknown) {
    this.model = validateModel(artifact);
  }
  /** Load a TFLite file exported by Interactive ML. */
  static fromTFLite(bytes: Uint8Array): Predictor {
    return new Predictor(decodeTFLite(bytes));
  }
  get kind() {
    return this.active.kind;
  }
  get labels(): string[] {
    return this.active.classifier.labels.slice();
  }
  get featureId() {
    return this.active.featureId;
  }
  export(): ModelArtifact {
    return structuredClone(this.active);
  }
  /** Export a TFLite classifier entirely on-device, including label metadata. */
  exportTFLite(): Uint8Array<ArrayBuffer> {
    return encodeTFLite(this.active);
  }
  dispose() {
    this.model = null;
  }
  private get active() {
    if (!this.model) throw new Error('Predictor is disposed.');
    return this.model;
  }

  predictFeatures(features: number[], featureId: string): Prediction {
    const model = this.active;
    if (featureId !== model.featureId)
      throw new Error('Feature schema does not match this model.');
    const data = model.classifier;
    assertVector(features, data.mean.length);
    const values = probabilities(features, data);
    const best = values.indexOf(Math.max(...values));
    const distance = Math.sqrt(
      features.reduce(
        (sum, v, i) =>
          sum +
          ((v - data.mean[i]) / data.scale[i] - data.centers[best][i]) ** 2,
        0
      ) / features.length
    );
    const score = values[best];
    return {
      label:
        score >= model.threshold && distance <= data.radii[best]
          ? data.labels[best]
          : null,
      score,
      scores: Object.fromEntries(
        data.labels.map((label, i) => [label, values[i]])
      ),
    };
  }

  predictHand(frames: HandFrame[]): Prediction {
    const model = this.active;
    if (model.kind !== 'hand-pose')
      throw new Error('Expected a hand-pose model.');
    return this.predictFeatures(poseFeatures(frames), HAND_FEATURE_ID);
  }
}
