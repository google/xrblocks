import { HandFrame } from "./Types.js";
import { Handedness, Hands } from "xrblocks";
//#region src/addons/interactive-ml/HandFeatures.d.ts
/** Copy normalized pose features directly from the SDK's tracked hand joints. */
export declare function captureHand(hands: Hands | undefined, handedness: Handedness, timeMs: number): HandFrame | null;
export declare function validateFrames(frames: HandFrame[]): void;
export declare function poseFeatures(frames: HandFrame[]): number[];
//#endregion