import { ZERO_VISEME } from './BlendshapeReducer.js';

const DEFAULT_VOWEL_TAU = 0.1;
const DEFAULT_CONSONANT_TAU = 0.07;
const DEFAULT_FORMANT_TAU = 0.1;
// Seconds of contiguous silence after which the smoothed F1/F2 cache
// is reset, so the first voiced frame of a new utterance doesn't blend
// from the previous vowel's stale formants.
const FORMANT_DECAY_AFTER_SILENCE_S = 0.25;
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
class FormantVisemeMapper {
    constructor(opts = {}) {
        this.current = { ...ZERO_VISEME };
        this.smoothF1 = 0;
        this.smoothF2 = 0;
        /** Seconds of contiguous unvoiced input; resets to 0 on any voiced frame. */
        this.silentFor = 0;
        this.vowelTau = opts.vowelTau ?? DEFAULT_VOWEL_TAU;
        this.consonantTau = opts.consonantTau ?? DEFAULT_CONSONANT_TAU;
    }
    update(features, dt) {
        if (!features)
            return this.current;
        const { rms, centroid, low, mid, high, f1Hz, f2Hz, voiced } = features;
        // 1. Voicing gate so background noise doesn't drive the mouth.
        const voicingGate = voiced ? 1 : smoothstep(0.02, 0.05, rms);
        // 2. Jaw drive = scaled RMS.
        const jawTarget = clamp01(voicingGate * Math.min(1, rms * 6));
        // 3. Consonant: high-band dominance.
        const fricRatio = high / (low + mid + high + 0.001);
        const brightness = clamp01((centroid - 1500) / 2500);
        const consonantTarget = clamp01(voicingGate * (0.55 * brightness + 0.7 * fricRatio));
        // 4. Smooth the raw F1/F2 peaks so per-frame bin jitter doesn't
        //    knock sustained vowels (especially /oo/, whose true F2 sits
        //    very close to a noisy 2x harmonic) out of their classification.
        //    Skip the update on unvoiced frames so silence doesn't pull the
        //    smoothed values toward zero. After a long contiguous silence,
        //    clear the cached formants so the first voiced frame of a new
        //    utterance doesn't smooth from the previous vowel's stale
        //    F1/F2 and briefly emit the wrong viseme.
        if (voicingGate > 0.5 && f1Hz > 0 && f2Hz > 0) {
            this.silentFor = 0;
            const formantAlpha = 1 - Math.exp(-dt / DEFAULT_FORMANT_TAU);
            this.smoothF1 = this.smoothF1
                ? lerp(this.smoothF1, f1Hz, formantAlpha)
                : f1Hz;
            this.smoothF2 = this.smoothF2
                ? lerp(this.smoothF2, f2Hz, formantAlpha)
                : f2Hz;
        }
        else {
            this.silentFor += dt;
            if (this.silentFor > FORMANT_DECAY_AFTER_SILENCE_S) {
                this.smoothF1 = 0;
                this.smoothF2 = 0;
            }
        }
        const sF1 = this.smoothF1;
        const sF2 = this.smoothF2;
        // 5. Vowel identity from smoothed F1/F2. Compete the three
        //    membership scores so /aa/ doesn't also light up /oo/.
        const vowelMass = clamp01(voicingGate * (1 - consonantTarget));
        let aaScore = 0;
        let eeScore = 0;
        let ooScore = 0;
        if (vowelMass > 0.1 && sF1 > 0 && sF2 > 0) {
            aaScore = smoothstep(550, 850, sF1);
            const f1Low = 1 - smoothstep(350, 600, sF1);
            const f2High = smoothstep(1700, 2400, sF2);
            eeScore = f1Low * f2High;
            // Widen the f2Low band: /oo/ has its true F2 right at the bottom
            // of the F2 search range, so even with smoothing F2 can drift up
            // to ~1500-1700 Hz on noisy frames. The looser cutoff lets /oo/
            // partially survive that drift rather than cliff-falling to zero.
            const f2Low = 1 - smoothstep(1100, 1700, sF2);
            ooScore = f1Low * f2Low;
        }
        const sum = aaScore + eeScore + ooScore + 0.001;
        aaScore = (aaScore / sum) * vowelMass;
        eeScore = (eeScore / sum) * vowelMass;
        ooScore = (ooScore / sum) * vowelMass;
        // 6. Frame-rate-independent smoothing of the final viseme weights.
        const vowelAlpha = 1 - Math.exp(-dt / this.vowelTau);
        const consAlpha = 1 - Math.exp(-dt / this.consonantTau);
        this.current = {
            jawOpen: lerp(this.current.jawOpen, jawTarget, vowelAlpha),
            aa: lerp(this.current.aa, aaScore, vowelAlpha),
            oo: lerp(this.current.oo, ooScore, vowelAlpha),
            // Formant heuristic doesn't have a separate /oh/ signal; the model
            // mapper supplies it instead.
            oh: 0,
            ee: lerp(this.current.ee, eeScore, vowelAlpha),
            consonant: lerp(this.current.consonant, consonantTarget, consAlpha),
        };
        return this.current;
    }
    reset() {
        this.current = { ...ZERO_VISEME };
        this.smoothF1 = 0;
        this.smoothF2 = 0;
        this.silentFor = 0;
    }
}
function clamp01(x) {
    return Math.min(1, Math.max(0, x));
}
function smoothstep(edge0, edge1, x) {
    const t = clamp01((x - edge0) / (edge1 - edge0));
    return t * t * (3 - 2 * t);
}
function lerp(current, target, alpha) {
    return current + (target - current) * alpha;
}

export { FormantVisemeMapper };
