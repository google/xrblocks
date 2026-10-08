import { HandFrame, ModelArtifact, Prediction } from "./Types.js";
//#region src/addons/interactive-ml/Predictor.d.ts
/** Validates the complete format before a model can replace an active predictor. */
export declare function validateModel(value: unknown): ModelArtifact;
/** Immutable weights; safe to share between independent input streams. */
export declare class Predictor {
  private model;
  constructor(artifact: unknown);
  /** Load a TFLite file exported by Interactive ML. */
  static fromTFLite(bytes: Uint8Array): Predictor;
  get kind(): "hand-pose" | "sound";
  get labels(): string[];
  get featureId(): string;
  export(): ModelArtifact;
  /** Export a TFLite classifier entirely on-device, including label metadata. */
  exportTFLite(): Uint8Array<ArrayBuffer>;
  dispose(): void;
  private get active();
  predictFeatures(features: number[], featureId: string): Prediction;
  predictHand(frames: HandFrame[]): Prediction;
}
//#endregion