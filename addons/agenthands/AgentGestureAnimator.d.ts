import * as THREE from 'three';
import type { AgentHand } from './AgentHand';
import type { AgentHands } from './AgentHands';
import type { AgentMotionKind, GestureStep } from './AgentGestures';
/**
 * Drives an {@link AgentHands} pair from timed {@link GestureStep}s: plays
 * poses, motions, and points, and tracks which hand is currently pointing (and
 * at what) so the app can drive a pointer visualization or the agent's gaze.
 * This is the "gesture animator": it turns steps into hand movement and owns no
 * timing of its own (the caller schedules when each step fires).
 */
export declare class AgentGestureAnimator {
    private readonly hands;
    /** Whether a hand is currently pointing at a world target. */
    pointing: boolean;
    /** The world-space point being pointed at, or null. */
    target: THREE.Vector3 | null;
    /** The hand doing the pointing, or null. */
    activeHand: AgentHand | null;
    /** @param hands - The hand pair to drive. */
    constructor(hands: AgentHands);
    /**
     * Plays one gesture step: a point, a motion, or a static pose. A point step
     * aims a hand; any other step first stops pointing so the per-frame re-aim
     * does not fight the new pose.
     * @param step - The step to play.
     */
    fireStep(step: GestureStep): void;
    /**
     * Dispatches a motion gesture to the hands.
     * @param motion - The motion kind.
     * @param param - Optional parameter (size word/number, or count).
     */
    playMotion(motion: AgentMotionKind, param?: string): void;
    /**
     * Maps a size word/number to a separation between the hands, in metres.
     * @param param - `small`, `big`/`large`, or a number (clamped to 0.1..0.8).
     * @returns The separation width in metres.
     */
    sizeWidth(param?: string): number;
    /**
     * Points a hand at a world point and records the pointing state (which hand,
     * and the target) for the caller's pointer viz / gaze.
     * @param point - The world-space point to aim at.
     */
    pointAt(point: THREE.Vector3): void;
    /**
     * Re-aims the pointing hand at the current target. Call once per frame while
     * the rig moves (e.g. head-anchored) so the finger stays locked on.
     */
    reaim(): void;
    /** Relaxes both hands and clears the pointing state. */
    rest(): void;
    /** Clears the pointing state without moving the hands. */
    stopPointing(): void;
}
