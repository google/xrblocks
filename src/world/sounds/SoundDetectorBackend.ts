import {WorldOptions} from '../WorldOptions';
import {AudioClassifierResult} from './DetectedSounds';

/**
 * The context required by detector backends to operate.
 * Provides access to options and the mic input audio sample rate.
 */
export interface DetectorBackendContext {
  options: WorldOptions;
  sampleRate: number;
}

/**
 * Represents audio data that has been normalized for easier consumption by classifiers models.
 */
export interface NormalizedAudio {
  data: Float32Array;
}

/**
 * Base class for sound detector backends.
 * Handles the orchestration of normalizing audio, running classifiers and creating results.
 */
export abstract class BaseDetectorBackend {
  protected context: DetectorBackendContext;

  constructor(context: DetectorBackendContext) {
    this.context = context;
  }

  /**
   * Classifies the provided normalized audio data.
   * @param audio - The normalized audio data to classify.
   * @returns The classification result or null if no result could be produced.
   */
  abstract classify(audio: NormalizedAudio): AudioClassifierResult | null;

  /**
   * Normalizes raw audio data into a format suitable for classification.
   * @param arrayBuffer - The raw audio data buffer.
   * @returns The normalized audio data.
   */
  abstract normalizeAudio(arrayBuffer: ArrayBuffer): NormalizedAudio;

  /**
   * Calculates debug information for the given audio data.
   * @param audio - The normalized audio data.
   * @returns An object containing RMS, buffer size, and sample rate.
   */
  populateDebugData(audio: NormalizedAudio): {
    rms: number;
    bufferSize: number;
    sampleRate: number;
  } {
    let sumSquares = 0;
    const audioData = audio.data;
    for (let i = 0; i < audioData.length; i++) {
      sumSquares += audioData[i] * audioData[i];
    }
    const rms = Math.sqrt(sumSquares / audioData.length);

    return {
      rms: rms,
      bufferSize: audioData.length,
      sampleRate: this.context.sampleRate,
    };
  }

  dispose() {}
}
