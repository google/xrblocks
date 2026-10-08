import {
  MAX_EXAMPLES,
  DEFAULT_THRESHOLD,
  HAND_FEATURE_ID,
  MODEL_FORMAT,
  HAND_PROJECT_FORMAT,
  ARTIFACT_VERSION,
} from './constants';
import {Dataset} from './Dataset';
import {poseFeatures, validateFrames} from './HandFeatures';
import {trainClassifier} from './Learning';
import {Predictor} from './Predictor';
import {evaluatePredictions} from './Types';
import type {HandFrame, ModelArtifact, TrainingOptions} from './Types';

export interface HandExample {
  id: string;
  label: string;
  /** Use distinct recording sessions for validation; never split adjacent frames. */
  frames: HandFrame[];
}
export interface HandProject {
  format: typeof HAND_PROJECT_FORMAT;
  version: typeof ARTIFACT_VERSION;
  kind: 'hand-pose';
  examples: HandExample[];
}

/** A persistent dataset. Training snapshots it and never changes an active model. */
export class HandTrainer extends Dataset<HandExample> {
  readonly kind = 'hand-pose' as const;
  addExample(label: string, frames: HandFrame[]): string {
    validateFrames(frames);
    return this.add({label, frames});
  }
  exportProject(): HandProject {
    return structuredClone({
      format: HAND_PROJECT_FORMAT,
      version: ARTIFACT_VERSION,
      kind: this.kind,
      examples: this.examples,
    });
  }
  static loadProject(value: unknown): HandTrainer {
    const p = value as HandProject;
    if (
      !p ||
      p.format !== HAND_PROJECT_FORMAT ||
      p.version !== ARTIFACT_VERSION ||
      p.kind !== 'hand-pose' ||
      !Array.isArray(p.examples) ||
      p.examples.length > MAX_EXAMPLES
    )
      throw new Error('Unsupported training project.');
    const trainer = new HandTrainer();
    trainer.restore(p.examples, (example) => validateFrames(example.frames));
    return trainer;
  }
  async train(
    options: TrainingOptions & {threshold?: number} = {}
  ): Promise<Predictor> {
    options.signal?.throwIfAborted();
    const examples = structuredClone(this.examples);
    if (!examples.length) throw new Error('Record examples first.');
    const artifact: ModelArtifact = {
      format: MODEL_FORMAT,
      version: ARTIFACT_VERSION,
      kind: this.kind,
      featureId: HAND_FEATURE_ID,
      threshold: options.threshold ?? DEFAULT_THRESHOLD,
      classifier: await trainClassifier(
        examples.map((e) => ({
          label: e.label,
          features: poseFeatures(e.frames),
        })),
        options
      ),
    };
    options.signal?.throwIfAborted();
    return new Predictor(artifact);
  }
  /** Pass separate recordings, never the examples used to train this predictor. */
  evaluate(
    predictor: Predictor,
    examples: {label: string; frames: HandFrame[]}[]
  ) {
    if (predictor.kind !== this.kind)
      throw new Error('Model kind does not match.');
    return evaluatePredictions(
      examples.map((e) => ({
        label: e.label,
        prediction: predictor.predictHand(e.frames),
      }))
    );
  }
}
