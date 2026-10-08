import { AudioClip, SoundFeatureExtractor } from "./SoundTrainer.js";
//#region src/addons/interactive-ml/Yamnet.d.ts
/** Minimal TensorFlow.js surface. Pass the runtime explicitly; no core dependency. */
interface Tensor {
  shape: number[];
  data(): Promise<ArrayLike<number>>;
  dispose(): void;
}
interface GraphModel {
  predict(input: Tensor): Tensor | Tensor[] | Record<string, Tensor>;
  dispose(): void;
}
export interface YamnetRuntime {
  tensor1d(values: Float32Array): Tensor;
  loadGraphModel(url: string, options?: {
    fromTFHub?: boolean;
  }): Promise<GraphModel>;
}
/** Windowed-sinc resampling, including a low-pass filter when downsampling. */
export declare function resampleAudio(clip: AudioClip): Float32Array;
/** Run in a worker for live XR. The caller owns the TensorFlow.js runtime.
 * Model assets may be served locally; keep featureId tied to the exact weights.
 */
export declare class YamnetExtractor implements SoundFeatureExtractor {
  private tf;
  private model;
  readonly featureId: string;
  readonly dimensions = 1024;
  private closed;
  private busy;
  private constructor();
  static load(tf: YamnetRuntime, options?: {
    url?: string;
    featureId?: string;
    fromTFHub?: boolean;
  }): Promise<YamnetExtractor>;
  extract(clip: AudioClip): Promise<number[]>;
  dispose(): void;
}
//#endregion