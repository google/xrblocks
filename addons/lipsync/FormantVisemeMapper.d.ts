import type { VisemeWeights } from './BlendshapeReducer';
/**
 * Per-frame audio features the FormantVisemeMapper consumes. Produced by
 * the audio pipeline (AnalyserNode + FFT analysis) and shared between the
 * formant heuristic and any optional learned mapper.
 */
export interface AudioFeatures {
    /** Root-mean-square amplitude in [0, 1]; used for voicing + jaw drive. */
    rms: number;
    /** Spectral centroid in Hz; used as a brightness proxy for sibilance. */
    centroid: number;
    /** Low-band, mid-band, and high-band energy fractions. */
    low: number;
    mid: number;
    high: number;
    /** Estimated first and second formant in Hz; 0 when unknown. */
    f1Hz: number;
    f2Hz: number;
    /** Voicing decision (true when periodic energy is present). */
    voiced: boolean;
}
export interface FormantVisemeMapperOptions {
    /**
     * Time constants (seconds) for the exponential smoothing of each output
     * channel. Smaller means snappier. Independent of frame rate.
     */
    vowelTau?: number;
    consonantTau?: number;
}
/**
 * Heuristic audio-to-viseme mapper based on the first two formants. Vowel
 * identity in speech is set by F1/F2:
 *
 *   "aa" = F1 high (~700-900 Hz)
 *   "ee" = F1 low  (~250-400 Hz) + F2 high (~2000-2500 Hz)
 *   "oo" = F1 low  (~300-450 Hz) + F2 low  (~700-1000 Hz)
 *
 * Consonants are characterised by high-band sibilance (fricatives) or
 * very low RMS during stops.
 *
 * Smoothing uses `1 - exp(-dt / tau)`, which gives the same time-to-target
 * regardless of frame rate (important on XR devices that run at 60, 72,
 * 90, or 120 Hz). The `dt` argument to `update()` is the seconds since
 * the previous frame.
 */
export declare class FormantVisemeMapper {
    private current;
    private smoothF1;
    private smoothF2;
    /** Seconds of contiguous unvoiced input; resets to 0 on any voiced frame. */
    private silentFor;
    private readonly vowelTau;
    private readonly consonantTau;
    constructor(opts?: FormantVisemeMapperOptions);
    update(features: AudioFeatures, dt: number): VisemeWeights;
    reset(): void;
}
