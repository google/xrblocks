import {trainClassifier} from './Learning';
import {Predictor} from './Predictor';
import {assertLabel, assertVector, evaluatePredictions} from './Types';
import type {TrainingOptions} from './Types';

export interface AudioClip {
  /** Mono PCM in [-1, 1]. */
  samples: Float32Array;
  sampleRate: number;
}
export interface SoundFeatureExtractor {
  /** Exact encoder and preprocessing identity; included in saved models. */
  readonly featureId: string;
  readonly dimensions: number;
  extract(clip: AudioClip): Promise<number[]>;
}
export interface SoundProject {
  format: 'xrblocks-interactive-ml-sound-project';
  version: 1;
  featureId: string;
  dimensions: number;
  /** Cached features permit retraining; original audio is owned by the app. */
  examples: {id: string; label: string; features: number[]}[];
}

/** Owns cached training features, not the extractor or the microphone. */
export class SoundTrainer {
  private examples: SoundProject['examples'] = [];
  constructor(readonly extractor: SoundFeatureExtractor) {
    if (
      !extractor.featureId ||
      extractor.featureId.length > 512 ||
      !Number.isInteger(extractor.dimensions) ||
      extractor.dimensions < 1 ||
      extractor.dimensions > 2048
    )
      throw new Error('Invalid audio feature extractor.');
  }
  get counts(): Record<string, number> {
    return Object.fromEntries(
      [...new Set(this.examples.map((e) => e.label))].map((label) => [
        label,
        this.examples.filter((e) => e.label === label).length,
      ])
    );
  }
  async addExample(label: string, clip: AudioClip): Promise<string> {
    assertLabel(label);
    return this.addFeatures(label, await this.extractor.extract(clip));
  }
  /** Add an embedding from this trainer's extractor without extracting twice. */
  addFeatures(label: string, features: number[]) {
    assertLabel(label);
    assertVector(features, this.extractor.dimensions);
    const counts = this.counts;
    if (
      this.examples.length >= 512 ||
      (counts[label] ?? 0) >= 64 ||
      (!(label in counts) && Object.keys(counts).length >= 32)
    )
      throw new Error('Dataset limit reached. Remove examples first.');
    const id = crypto.randomUUID();
    this.examples.push({id, label, features: features.slice()});
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
    const counts = this.counts;
    if (
      (counts[label] ?? 0) >= 64 ||
      (!(label in counts) &&
        Object.keys(counts).length >= 32 &&
        counts[example.label] > 1)
    )
      throw new Error('Class limit reached.');
    example.label = label;
  }
  async train(options: TrainingOptions & {threshold?: number} = {}) {
    const classifier = await trainClassifier(
      structuredClone(this.examples),
      options
    );
    return new Predictor({
      format: 'xrblocks-interactive-ml',
      version: 1,
      kind: 'sound',
      featureId: this.extractor.featureId,
      threshold: options.threshold ?? 0.65,
      classifier,
    });
  }
  async predict(predictor: Predictor, clip: AudioClip) {
    if (
      predictor.kind !== 'sound' ||
      predictor.featureId !== this.extractor.featureId
    )
      throw new Error('Audio model does not match this extractor.');
    return predictor.predictFeatures(
      await this.extractor.extract(clip),
      this.extractor.featureId
    );
  }
  async evaluate(
    predictor: Predictor,
    examples: {label: string; clip: AudioClip}[]
  ) {
    const results = [];
    for (const e of examples)
      results.push({
        label: e.label,
        prediction: await this.predict(predictor, e.clip),
      });
    return evaluatePredictions(results);
  }
  exportProject(): SoundProject {
    return structuredClone({
      format: 'xrblocks-interactive-ml-sound-project',
      version: 1,
      featureId: this.extractor.featureId,
      dimensions: this.extractor.dimensions,
      examples: this.examples,
    });
  }
  static loadProject(value: unknown, extractor: SoundFeatureExtractor) {
    const p = value as SoundProject;
    if (
      !p ||
      p.format !== 'xrblocks-interactive-ml-sound-project' ||
      p.version !== 1 ||
      p.featureId !== extractor.featureId ||
      p.dimensions !== extractor.dimensions ||
      !Array.isArray(p.examples) ||
      p.examples.length > 512
    )
      throw new Error('Incompatible sound project.');
    const trainer = new SoundTrainer(extractor);
    const ids = new Set<string>();
    for (const example of p.examples) {
      if (
        !example ||
        typeof example.id !== 'string' ||
        !example.id ||
        ids.has(example.id)
      )
        throw new Error('Invalid example ID.');
      trainer.addFeatures(example.label, example.features);
      trainer.examples.at(-1)!.id = example.id;
      ids.add(example.id);
    }
    return trainer;
  }
}
