import {HAND_FEATURE_ID, poseFeatures, validateFrames} from './HandFeatures';
import {trainClassifier} from './Learning';
import {Predictor} from './Predictor';
import {assertLabel, evaluatePredictions} from './Types';
import type {HandFrame, ModelArtifact, TrainingOptions} from './Types';

export interface HandExample {
  id: string;
  label: string;
  /** Use distinct recording sessions for validation; never split adjacent frames. */
  frames: HandFrame[];
}
export interface HandProject {
  format: 'xrblocks-interactive-ml-project';
  version: 1;
  kind: 'hand-pose';
  examples: HandExample[];
}

/** A persistent dataset. Training snapshots it and never changes an active model. */
export class HandTrainer {
  private examples: HandExample[] = [];
  readonly kind = 'hand-pose' as const;
  get counts(): Record<string, number> {
    return Object.fromEntries(
      [...new Set(this.examples.map((e) => e.label))].map((label) => [
        label,
        this.examples.filter((e) => e.label === label).length,
      ])
    );
  }
  addExample(label: string, frames: HandFrame[]): string {
    assertLabel(label);
    validateFrames(frames);
    const perClass = this.examples.filter((e) => e.label === label).length;
    if (
      this.examples.length >= 512 ||
      perClass >= 64 ||
      (!perClass && Object.keys(this.counts).length >= 32)
    )
      throw new Error('Dataset limit reached. Remove old examples first.');
    const id = crypto.randomUUID();
    this.examples.push({id, label, frames: structuredClone(frames)});
    return id;
  }
  removeExample(id: string) {
    this.examples = this.examples.filter((e) => e.id !== id);
  }
  relabelExample(id: string, label: string) {
    assertLabel(label);
    const example = this.examples.find((e) => e.id === id);
    if (!example) throw new Error('Unknown example.');
    if (example.label === label) return;
    const count = this.counts[label] ?? 0;
    if (
      count >= 64 ||
      (!count &&
        Object.keys(this.counts).length >= 32 &&
        this.counts[example.label] > 1)
    )
      throw new Error('Class limit reached.');
    example.label = label;
  }
  exportProject(): HandProject {
    return structuredClone({
      format: 'xrblocks-interactive-ml-project',
      version: 1,
      kind: this.kind,
      examples: this.examples,
    });
  }
  static loadProject(value: unknown): HandTrainer {
    const p = value as HandProject;
    if (
      !p ||
      p.format !== 'xrblocks-interactive-ml-project' ||
      p.version !== 1 ||
      p.kind !== 'hand-pose' ||
      !Array.isArray(p.examples) ||
      p.examples.length > 512
    )
      throw new Error('Unsupported training project.');
    const trainer = new HandTrainer();
    const ids = new Set<string>();
    for (const e of p.examples) {
      if (!e || typeof e.id !== 'string' || !e.id || ids.has(e.id))
        throw new Error('Invalid example ID.');
      trainer.addExample(e.label, e.frames);
      trainer.examples.at(-1)!.id = e.id;
      ids.add(e.id);
    }
    return trainer;
  }
  async train(
    options: TrainingOptions & {threshold?: number} = {}
  ): Promise<Predictor> {
    options.signal?.throwIfAborted();
    const examples = structuredClone(this.examples);
    if (!examples.length) throw new Error('Record examples first.');
    const artifact: ModelArtifact = {
      format: 'xrblocks-interactive-ml',
      version: 1,
      kind: this.kind,
      featureId: HAND_FEATURE_ID,
      threshold: options.threshold ?? 0.65,
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
