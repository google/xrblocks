/**
 * Audio-driven mouth animation addon for xrblocks. The primary export,
 * `LipsyncMouth`, is a small `xb.Script` that pulls audio from a
 * `MediaStream`, runs an FFT + formant-based viseme mapper on it every
 * frame, and writes the viseme weights to a `setVisemes`-compatible
 * target — typically the `face` on a netblocks `RemoteUserAvatar`, or
 * a standalone `xb.StylizedFace` for non-multiplayer use.
 *
 * The face primitive itself (`StylizedFace`) and the viseme contract
 * type (`VisemeWeights`) live in xrblocks core so neither addon has
 * to depend on the other.
 *
 * @see {@link LipsyncMouth}
 */
export { LipsyncMouth } from './LipsyncMouth';
export type { LipsyncMouthOptions, VisemeTarget } from './LipsyncMouth';
export { FormantVisemeMapper } from './FormantVisemeMapper';
export type { AudioFeatures, FormantVisemeMapperOptions, } from './FormantVisemeMapper';
export { MfccExtractor, NUM_MFCC } from './MfccExtractor';
export type { MfccExtractorOptions } from './MfccExtractor';
export { ARKIT_BLENDSHAPE_NAMES, blendshapesToVisemes, ZERO_VISEME, } from './BlendshapeReducer';
export type { VisemeWeights } from './BlendshapeReducer';
export { computeAudioFeatures } from './computeAudioFeatures';
export type { AudioFeatureInputs } from './computeAudioFeatures';
