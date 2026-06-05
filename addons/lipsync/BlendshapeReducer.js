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
const ARKIT_BLENDSHAPE_NAMES = [
    '_neutral',
    'browDownLeft',
    'browDownRight',
    'browInnerUp',
    'browOuterUpLeft',
    'browOuterUpRight',
    'cheekPuff',
    'cheekSquintLeft',
    'cheekSquintRight',
    'eyeBlinkLeft',
    'eyeBlinkRight',
    'eyeLookDownLeft',
    'eyeLookDownRight',
    'eyeLookInLeft',
    'eyeLookInRight',
    'eyeLookOutLeft',
    'eyeLookOutRight',
    'eyeLookUpLeft',
    'eyeLookUpRight',
    'eyeSquintLeft',
    'eyeSquintRight',
    'eyeWideLeft',
    'eyeWideRight',
    'jawForward',
    'jawLeft',
    'jawOpen',
    'jawRight',
    'mouthClose',
    'mouthDimpleLeft',
    'mouthDimpleRight',
    'mouthFrownLeft',
    'mouthFrownRight',
    'mouthFunnel',
    'mouthLeft',
    'mouthLowerDownLeft',
    'mouthLowerDownRight',
    'mouthPressLeft',
    'mouthPressRight',
    'mouthPucker',
    'mouthRight',
    'mouthRollLower',
    'mouthRollUpper',
    'mouthShrugLower',
    'mouthShrugUpper',
    'mouthSmileLeft',
    'mouthSmileRight',
    'mouthStretchLeft',
    'mouthStretchRight',
    'mouthUpperUpLeft',
    'mouthUpperUpRight',
    'noseSneerLeft',
    'noseSneerRight',
];
const ZERO_VISEME = Object.freeze({
    jawOpen: 0,
    aa: 0,
    oo: 0,
    oh: 0,
    ee: 0,
    consonant: 0,
});
// Dead-zone threshold; anything below this collapses to zero. Calibrated
// to be just above MediaPipe FaceLandmarker's typical rest-pose baseline.
const DEAD_ZONE = 0.1;
const NAME_TO_INDEX = new Map(ARKIT_BLENDSHAPE_NAMES.map((n, i) => [n, i]));
function clamp(x) {
    return Math.min(1, Math.max(0, x));
}
function deadzone(x) {
    return x < DEAD_ZONE ? 0 : (x - DEAD_ZONE) / (1 - DEAD_ZONE);
}
function read(arr, name) {
    const i = NAME_TO_INDEX.get(name);
    return i === undefined ? 0 : deadzone(clamp(arr[i] ?? 0));
}
/**
 * Reduce a 52-element ARKit blendshape vector to viseme weights for the
 * stylised mouth. Pure function; safe to call every frame.
 */
function blendshapesToVisemes(arr) {
    const jawOpen = read(arr, 'jawOpen');
    const funnel = read(arr, 'mouthFunnel');
    const pucker = read(arr, 'mouthPucker');
    const smileL = read(arr, 'mouthSmileLeft');
    const smileR = read(arr, 'mouthSmileRight');
    const stretchL = read(arr, 'mouthStretchLeft');
    const stretchR = read(arr, 'mouthStretchRight');
    const close = read(arr, 'mouthClose');
    const pressL = read(arr, 'mouthPressLeft');
    const pressR = read(arr, 'mouthPressRight');
    // /oh/ = jaw open + rounded; isolate before /oo/ and /aa/ steal energy.
    const oh = clamp(jawOpen * pucker * 1.8);
    const oo = clamp(funnel + pucker * (1 - jawOpen * 0.8) - oh * 0.5);
    const aa = clamp(jawOpen * (1 - pucker) - oh * 0.3);
    // ARKit's /i/ ("ee") signature: corners pulled sideways (mouthStretch),
    // not corners pulled up (mouthSmile). Smile is a weak secondary cue.
    const ee = clamp((stretchL + stretchR) / 2 + (smileL + smileR) / 4);
    const consonant = clamp(Math.max(close, pressL + pressR));
    return { jawOpen, aa, oo, oh, ee, consonant };
}

export { ARKIT_BLENDSHAPE_NAMES, ZERO_VISEME, blendshapesToVisemes };
