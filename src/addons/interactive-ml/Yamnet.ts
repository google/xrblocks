import type {AudioClip, SoundFeatureExtractor} from './SoundTrainer';

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
  loadGraphModel(
    url: string,
    options?: {fromTFHub?: boolean}
  ): Promise<GraphModel>;
}

export const YAMNET_URL = 'https://tfhub.dev/google/tfjs-model/yamnet/tfjs/1';
export const YAMNET_FEATURE_ID = 'google-yamnet-tfjs-1:mono16k-mean-l2-v1';

/** Windowed-sinc resampling, including a low-pass filter when downsampling. */
export function resampleAudio(clip: AudioClip): Float32Array {
  const {samples, sampleRate} = clip;
  if (
    !(samples instanceof Float32Array) ||
    !Number.isFinite(sampleRate) ||
    sampleRate < 8000 ||
    sampleRate > 192000 ||
    samples.length < sampleRate * 0.1 ||
    samples.length > sampleRate * 10 ||
    !samples.every((v) => Number.isFinite(v) && Math.abs(v) <= 1)
  )
    throw new Error('Provide 0.1–10 seconds of finite mono PCM in [-1, 1].');
  if (sampleRate === 16000) return samples.slice();
  const ratio = sampleRate / 16000;
  const cutoff = Math.min(1, 1 / ratio);
  const radius = Math.ceil(16 / cutoff);
  const output = new Float32Array(Math.round(samples.length / ratio));
  for (let i = 0; i < output.length; i++) {
    const center = i * ratio;
    let sum = 0,
      weights = 0;
    for (
      let j = Math.max(0, Math.ceil(center - radius));
      j <= Math.min(samples.length - 1, Math.floor(center + radius));
      j++
    ) {
      const distance = j - center;
      const phase = Math.PI * distance * cutoff;
      const weight =
        (Math.abs(phase) < 1e-8 ? 1 : Math.sin(phase) / phase) *
        (0.5 + 0.5 * Math.cos((Math.PI * distance) / radius));
      sum += samples[j] * weight;
      weights += weight;
    }
    output[i] = Math.max(-1, Math.min(1, sum / weights));
  }
  return output;
}

/** Run in a worker for live XR. The caller owns the TensorFlow.js runtime.
 * Model assets may be served locally; keep featureId tied to the exact weights.
 */
export class YamnetExtractor implements SoundFeatureExtractor {
  readonly dimensions = 1024;
  private closed = false;
  private busy = false;
  private constructor(
    private tf: YamnetRuntime,
    private model: GraphModel,
    readonly featureId: string
  ) {}
  static async load(
    tf: YamnetRuntime,
    options: {url?: string; featureId?: string; fromTFHub?: boolean} = {}
  ) {
    if (options.url && !options.featureId)
      throw new Error(
        'A custom model URL requires its exact feature identity.'
      );
    const model = await tf.loadGraphModel(options.url ?? YAMNET_URL, {
      fromTFHub: options.fromTFHub ?? !options.url,
    });
    return new YamnetExtractor(
      tf,
      model,
      options.featureId ?? YAMNET_FEATURE_ID
    );
  }
  async extract(clip: AudioClip): Promise<number[]> {
    if (this.closed || this.busy)
      throw new Error(
        this.closed
          ? 'Extractor is disposed.'
          : 'Audio extraction is already running.'
      );
    const samples = resampleAudio(clip);
    // Use at least one complete YAMNet window. Short clips are zero-padded.
    const waveform =
      samples.length >= 15600 ? samples : new Float32Array(15600);
    if (waveform !== samples) waveform.set(samples);
    this.busy = true;
    let input: Tensor | undefined;
    let outputs: Tensor[] = [];
    try {
      input = this.tf.tensor1d(waveform);
      const result = this.model.predict(input);
      outputs = Array.isArray(result)
        ? result
        : 'shape' in result
          ? [result as Tensor]
          : Object.values(result);
      const embedding = outputs.find(
        (t) => t.shape.length === 2 && t.shape[1] === 1024
      );
      if (!embedding || !embedding.shape[0])
        throw new Error('YAMNet did not return 1024-dimensional embeddings.');
      const values = await embedding.data();
      const features = Array.from({length: 1024}, (_, i) => {
        let sum = 0;
        for (let row = 0; row < embedding.shape[0]; row++)
          sum += values[row * 1024 + i];
        return sum / embedding.shape[0];
      });
      const norm = Math.hypot(...features) || 1;
      return features.map((v) => v / norm);
    } finally {
      input?.dispose();
      for (const output of new Set(outputs)) output.dispose();
      this.busy = false;
      if (this.closed) this.model.dispose();
    }
  }
  dispose() {
    if (this.closed) return;
    this.closed = true;
    if (!this.busy) this.model.dispose();
  }
}
