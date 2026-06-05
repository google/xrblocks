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
const NUM_MELS = 26;
const NUM_MFCC = 13;
class MfccExtractor {
    constructor({ sampleRate, fftSize }) {
        this.numMels = NUM_MELS;
        this.numMfcc = NUM_MFCC;
        this.sampleRate = sampleRate;
        this.numBins = fftSize / 2;
        this.melBank = buildMelFilterbank(this.numMels, this.numBins, sampleRate);
        this.dct = buildDctBasis(this.numMfcc, this.numMels);
        this.melEnergies = new Float32Array(this.numMels);
        this.logMel = new Float32Array(this.numMels);
        this.mfcc = new Float32Array(this.numMfcc);
    }
    /**
     * Compute MFCCs for one frame.
     *
     * @param freqDb - Magnitude spectrum in dB from
     *   `AnalyserNode.getFloatFrequencyData()`. Length must equal `numBins`.
     * @returns A 13-element MFCC vector. The returned `Float32Array` is a
     *   live internal buffer; copy it (`Float32Array.from(out)`) if you
     *   need to retain it across frames.
     */
    extract(freqDb) {
        // 1. dB -> power, accumulated into mel bands.
        for (let i = 0; i < this.numMels; i++)
            this.melEnergies[i] = 0;
        for (let i = 0; i < this.numBins; i++) {
            // Clamp dB floor to avoid Math.pow(10, -Infinity / 10) = 0 issues.
            const db = Math.max(freqDb[i], -120);
            const power = Math.pow(10, db / 10);
            const filters = this.melBank[i];
            for (let m = 0; m < filters.length; m += 2) {
                const melIdx = filters[m];
                const weight = filters[m + 1];
                this.melEnergies[melIdx] += power * weight;
            }
        }
        // 2. log compression with a small floor.
        for (let m = 0; m < this.numMels; m++) {
            this.logMel[m] = Math.log(this.melEnergies[m] + 1e-10);
        }
        // 3. DCT-II to the first numMfcc coefficients.
        for (let k = 0; k < this.numMfcc; k++) {
            let sum = 0;
            const basis = this.dct[k];
            for (let m = 0; m < this.numMels; m++) {
                sum += this.logMel[m] * basis[m];
            }
            this.mfcc[k] = sum;
        }
        return this.mfcc;
    }
}
/**
 * Build a mel filterbank as a sparse per-FFT-bin lookup. For each bin we
 * precompute the (melIdx, weight) pairs that the bin contributes to.
 * This makes the per-frame `extract()` call cache-friendly and roughly
 * `O(numBins)` instead of `O(numBins * numMels)`.
 */
function buildMelFilterbank(numMels, numBins, sampleRate) {
    const fMin = 0;
    const fMax = sampleRate / 2;
    const melMin = hzToMel(fMin);
    const melMax = hzToMel(fMax);
    // numMels + 2 mel-spaced points: low edge, peak per filter, high edge.
    const points = new Array(numMels + 2);
    for (let i = 0; i < points.length; i++) {
        const mel = melMin + (i / (numMels + 1)) * (melMax - melMin);
        points[i] = melToHz(mel);
    }
    const bankArr = new Array(numBins);
    for (let b = 0; b < numBins; b++)
        bankArr[b] = [];
    const binHz = sampleRate / 2 / numBins;
    for (let m = 0; m < numMels; m++) {
        const left = points[m];
        const center = points[m + 1];
        const right = points[m + 2];
        const leftBin = Math.floor(left / binHz);
        const rightBin = Math.min(numBins - 1, Math.ceil(right / binHz));
        for (let b = leftBin; b <= rightBin; b++) {
            const hz = b * binHz;
            let weight = 0;
            if (hz >= left && hz <= center && center > left) {
                weight = (hz - left) / (center - left);
            }
            else if (hz >= center && hz <= right && right > center) {
                weight = (right - hz) / (right - center);
            }
            if (weight > 0)
                bankArr[b].push(m, weight);
        }
    }
    return bankArr.map((a) => Float32Array.from(a));
}
function buildDctBasis(numMfcc, numMels) {
    const basis = new Array(numMfcc);
    const norm = Math.sqrt(2 / numMels);
    for (let k = 0; k < numMfcc; k++) {
        const row = new Float32Array(numMels);
        for (let m = 0; m < numMels; m++) {
            row[m] = norm * Math.cos((Math.PI * k * (2 * m + 1)) / (2 * numMels));
        }
        basis[k] = row;
    }
    return basis;
}
function hzToMel(hz) {
    return 2595 * Math.log10(1 + hz / 700);
}
function melToHz(mel) {
    return 700 * (Math.pow(10, mel / 2595) - 1);
}

export { MfccExtractor, NUM_MFCC };
