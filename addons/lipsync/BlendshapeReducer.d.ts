/**
 * BlendshapeReducer
 *
 * Reduces a 52-element ARKit-compatible blendshape vector down to a tiny
 * 6-channel "viseme" record that drives a stylised mouth (jawOpen, aa, oo,
 * oh, ee, consonant).
 *
 * The two key tricks:
 *
 *  - **Dead-zone clip.** MediaPipe FaceLandmarker's per-face calibration
 *    typically leaves jawOpen / mouthFunnel / mouthPucker sitting at 0.05
 *    to 0.15 at rest. Without a dead-zone the avatar's mouth ends up
 *    permanently slightly ajar.
 *
 *  - **"oh" separation.** /oh/ (boat) and /oo/ (boot) are both rounded
 *    vowels, but /oh/ has the jaw open while /oo/ has it closed.
 *    Multiplying jawOpen by mouthPucker isolates /oh/, and we subtract
 *    that from /oo/ and /aa/ so the three channels are visibly distinct.
 */
/**
 * The 52 ARKit blendshape names, in the order Apple's ARKit and MediaPipe
 * FaceLandmarker's Blendshapes V2 model emit them. This ordering is fixed
 * by the format and used by both `BlendshapeReducer` and any caller that
 * supplies a model whose outputs are indexed by this order.
 */
export declare const ARKIT_BLENDSHAPE_NAMES: readonly string[];
import type { VisemeWeights } from 'xrblocks';
export type { VisemeWeights };
export declare const ZERO_VISEME: Readonly<{
    jawOpen: 0;
    aa: 0;
    oo: 0;
    oh: 0;
    ee: 0;
    consonant: 0;
}>;
/**
 * Reduce a 52-element ARKit blendshape vector to viseme weights for the
 * stylised mouth. Pure function; safe to call every frame.
 */
export declare function blendshapesToVisemes(arr: Float32Array): VisemeWeights;
