import * as THREE from 'three';
import { type SceneMotionAxis, type ScenePart } from './SceneTypes';
/** Component index of each part-local motion axis. */
export declare const MOTION_AXIS_INDEX: Record<SceneMotionAxis, number>;
interface MotionBase {
    /** Axis in the part's own rotated frame. */
    axis: SceneMotionAxis;
    /** Hinge or axle in part-local meters, relative to the authored center. */
    pivot: THREE.Vector3;
    /** Declared starting fraction of a cycle; an absent phase reads as 0. */
    phase: number;
}
export interface SwingMotion extends MotionBase {
    kind: 'swing';
    amplitude: number;
    period: number;
}
export interface SpinMotion extends MotionBase {
    kind: 'spin';
    speed: number;
}
/** A validated, detached copy of one part's motion definition. */
export type PartMotion = SwingMotion | SpinMotion;
/**
 * Validates one part's optional motion and copies it away from the caller's
 * data, so a live design never shares mutable definitions or produces NaN
 * transforms from malformed numbers.
 *
 * @param part - The authored part, whose rest pose is left untouched.
 * @returns The detached motion, or undefined when the part is static.
 */
export declare function readPartMotion(part: ScenePart): PartMotion | undefined;
/** The angle a motion reaches at one cycle fraction, in radians. */
export declare function motionAngle(motion: PartMotion, cycle: number): number;
/** The closed angular interval a motion can reach over its whole cycle. */
export declare function motionAngleRange(motion: PartMotion): [number, number];
/**
 * Animates the authored parts of one built procedural design in place.
 *
 * Each animated part rotates about its own local pivot, so descendants ride
 * along and the outer Roomcraft object stays a single grabbable owner. Rest
 * poses stay authored data: every frame is recomputed from them rather than
 * accumulated, and part sizes never scale descendants. The player owns no
 * timers, subscriptions, or GPU resources; the caller drives it per frame.
 */
export declare class ProceduralMotionPlayer {
    private readonly tracks;
    private readonly axis;
    private readonly offset;
    private readonly lever;
    /**
     * @param content - The built design; its part groups are posed in place.
     * @param parts - The authored parts, read and copied, never retained.
     * @param previous - The replaced player, read once for live cycle phases.
     */
    constructor(content: THREE.Group, parts: readonly ScenePart[], previous?: ProceduralMotionPlayer);
    /** How many parts this player animates. */
    get count(): number;
    /**
     * Advances every cycle and reposes the design.
     *
     * @param deltaSeconds - Elapsed frame time; zero re-applies the current pose.
     */
    update(deltaSeconds: number): void;
    /** Rebuilds each animated pose from its rest data, never from the last frame. */
    private apply;
}
export {};
