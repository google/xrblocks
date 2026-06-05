import type { AudioFeatures } from './FormantVisemeMapper';
export interface AudioFeatureInputs {
    /** `analyser.getByteFrequencyData()` output. */
    freqData: Uint8Array;
    /**
     * `analyser.getFloatFrequencyData()` output (dB), same length as
     * `freqData`. Reserved for downstream consumers (e.g. ML mappers
     * computing MFCC); the heuristic path doesn't read it.
     */
    freqDataFloat?: Float32Array;
    /** `analyser.getByteTimeDomainData()` output, length == `analyser.fftSize`. */
    timeData: Uint8Array;
    /**
     * Optional 13-element MFCC vector. Passed through unchanged in the
     * returned features so downstream consumers (e.g. a future
     * ModelMapper) see the same numbers; the formant-based mapper
     * doesn't consume it.
     */
    mfcc?: Float32Array;
}
/**
 * Pure-function feature extractor. Given the raw analyser buffers and the
 * audio context's sample rate, returns the per-frame features the viseme
 * mappers consume. Extracted from `LipsyncMouth` so the math is testable
 * without a real `AudioContext` / `AnalyserNode`.
 */
export declare function computeAudioFeatures(inputs: AudioFeatureInputs, sampleRate: number): AudioFeatures & {
    mfcc?: Float32Array;
};
