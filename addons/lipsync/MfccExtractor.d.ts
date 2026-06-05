/**
 * MFCC (Mel-Frequency Cepstral Coefficients) extractor for real-time
 * lipsync. Standard speech-recognition input features:
 *
 *   1. Power spectrum from the AnalyserNode's frequency data (already
 *      FFTed by Web Audio).
 *   2. Mel filterbank to sum energy into perceptually-spaced bands.
 *   3. Log compression.
 *   4. DCT decorrelates the log-mel energies and concentrates most of
 *      the information in the first ~13 coefficients.
 *
 * Output: 13-D vector per frame. Designed to feed either a learned
 * audio-to-blendshape model or a heuristic mapper.
 *
 * Why MFCCs instead of raw band energies:
 *   - Mel scale matches human pitch perception, so features are
 *     speaker-invariant in a way linear-Hz bands aren't.
 *   - DCT decorrelates, which lets a small MLP do more useful work
 *     per parameter.
 *   - Standard input for every off-the-shelf speech model, so a model
 *     trained elsewhere can drop in unchanged.
 */
export declare const NUM_MFCC = 13;
export interface MfccExtractorOptions {
    /** AudioContext sample rate (Hz). */
    sampleRate: number;
    /** AnalyserNode FFT size (power of two). `numBins = fftSize / 2`. */
    fftSize: number;
}
export declare class MfccExtractor {
    readonly sampleRate: number;
    readonly numBins: number;
    readonly numMels = 26;
    readonly numMfcc = 13;
    private readonly melBank;
    private readonly dct;
    private readonly melEnergies;
    private readonly logMel;
    private readonly mfcc;
    constructor({ sampleRate, fftSize }: MfccExtractorOptions);
    /**
     * Compute MFCCs for one frame.
     *
     * @param freqDb - Magnitude spectrum in dB from
     *   `AnalyserNode.getFloatFrequencyData()`. Length must equal `numBins`.
     * @returns A 13-element MFCC vector. The returned `Float32Array` is a
     *   live internal buffer; copy it (`Float32Array.from(out)`) if you
     *   need to retain it across frames.
     */
    extract(freqDb: Float32Array): Float32Array;
}
