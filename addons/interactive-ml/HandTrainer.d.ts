import { Dataset } from "./Dataset.js";
import { ARTIFACT_VERSION, HAND_PROJECT_FORMAT } from "./constants.js";
import { Evaluation, HandFrame, TrainingOptions } from "./Types.js";
import { Predictor } from "./Predictor.js";
//#region src/addons/interactive-ml/HandTrainer.d.ts
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
export declare class HandTrainer extends Dataset<HandExample> {
  readonly kind: 'hand-pose';
  addExample(label: string, frames: HandFrame[]): string;
  exportProject(): HandProject;
  static loadProject(value: unknown): HandTrainer;
  train(options?: TrainingOptions & {
    threshold?: number;
  }): Promise<Predictor>;
  /** Pass separate recordings, never the examples used to train this predictor. */
  evaluate(predictor: Predictor, examples: {
    label: string;
    frames: HandFrame[];
  }[]): Evaluation;
}
//#endregion