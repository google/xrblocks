import {
  YAMNET_URL,
  YAMNET_FEATURE_ID,
  YAMNET_DIMENSIONS,
  YAMNET_SAMPLE_RATE,
  YAMNET_MIN_SAMPLES,
  MIN_AUDIO_SAMPLE_RATE,
  MAX_AUDIO_SAMPLE_RATE,
  MIN_AUDIO_DURATION_SECONDS,
  MAX_AUDIO_DURATION_SECONDS,
  RESAMPLE_FILTER_RADIUS,
  SINC_EPSILON,
} from './constants';
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

/** Windowed-sinc resampling, including a low-pass filter when downsampling. */
export function resampleAudio(clip: AudioClip): Float32Array {
  const {samples, sampleRate} = clip;
  if (
    !(samples instanceof Float32Array) ||
    !Number.isFinite(sampleRate) ||
    sampleRate < MIN_AUDIO_SAMPLE_RATE ||
    sampleRate > MAX_AUDIO_SAMPLE_RATE ||
    samples.length < sampleRate * MIN_AUDIO_DURATION_SECONDS ||
    samples.length > sampleRate * MAX_AUDIO_DURATION_SECONDS ||
    !samples.every((v) => Number.isFinite(v) && Math.abs(v) <= 1)
  )
    throw new Error(
      `Provide ${MIN_AUDIO_DURATION_SECONDS}–${MAX_AUDIO_DURATION_SECONDS} seconds of finite mono PCM in [-1, 1].`
    );
  if (sampleRate === YAMNET_SAMPLE_RATE) return samples.slice();
  const ratio = sampleRate / YAMNET_SAMPLE_RATE;
  const cutoff = Math.min(1, 1 / ratio);
  const radius = Math.ceil(RESAMPLE_FILTER_RADIUS / cutoff);
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
        (Math.abs(phase) < SINC_EPSILON ? 1 : Math.sin(phase) / phase) *
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
  readonly dimensions = YAMNET_DIMENSIONS;
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
      samples.length >= YAMNET_MIN_SAMPLES
        ? samples
        : new Float32Array(YAMNET_MIN_SAMPLES);
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
        (t) => t.shape.length === 2 && t.shape[1] === YAMNET_DIMENSIONS
      );
      if (!embedding || !embedding.shape[0])
        throw new Error(
          `YAMNet did not return ${YAMNET_DIMENSIONS}-dimensional embeddings.`
        );
      const values = await embedding.data();
      const features = Array.from({length: YAMNET_DIMENSIONS}, (_, i) => {
        let sum = 0;
        for (let row = 0; row < embedding.shape[0]; row++)
          sum += values[row * YAMNET_DIMENSIONS + i];
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
