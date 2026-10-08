import { ARTIFACT_VERSION, SOUND_PROJECT_FORMAT } from "./constants.js";
import { Evaluation, Prediction, TrainingOptions } from "./Types.js";
import { Predictor } from "./Predictor.js";
//#region src/addons/interactive-ml/SoundTrainer.d.ts
export interface AudioClip {
  /** Mono PCM in [-1, 1]. */
  samples: Float32Array;
  sampleRate: number;
}
export interface SoundFeatureExtractor {
  readonly featureId: string;
  readonly dimensions: number;
  extract(clip: AudioClip): Promise<number[]>;
}
export interface SoundProject {
  format: typeof SOUND_PROJECT_FORMAT;
  version: typeof ARTIFACT_VERSION;
  featureId: string;
  dimensions: number;
  examples: {
    id: string;
    label: string;
    features: number[];
  }[];
}
export declare class SoundTrainer {
  readonly extractor: SoundFeatureExtractor;
  private examples;
  constructor(extractor: SoundFeatureExtractor);
  get counts(): Record<string, number>;
  addExample(label: string, clip: AudioClip): Promise<string>;
  addFeatures(label: string, features: number[]): `${string}-${string}-${string}-${string}-${string}`;
  removeExample(id: string): void;
  relabelExample(id: string, label: string): void;
  train(options?: TrainingOptions & {
    threshold?: number;
  }): Promise<Predictor>;
  predict(predictor: Predictor, clip: AudioClip): Promise<Prediction>;
  evaluate(predictor: Predictor, examples: {
    label: string;
    clip: AudioClip;
  }[]): Promise<Evaluation>;
  exportProject(): SoundProject;
  static loadProject(value: unknown, extractor: SoundFeatureExtractor): SoundTrainer;
}
//#endregion