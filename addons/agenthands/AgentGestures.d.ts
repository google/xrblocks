import * as THREE from 'three';
import { SimulatorHandPose } from 'xrblocks';
/** Maps gesture names the agent can emit to concrete hand poses. */
export declare const GESTURE_POSE_MAP: Readonly<Record<string, SimulatorHandPose>>;
/** Motion gesture kinds the agent can emit (animated, not static poses). */
export type AgentMotionKind = 'beat' | 'wave' | 'size' | 'count';
/** Maps gesture names to animated motion kinds. */
export declare const GESTURE_MOTION_MAP: Readonly<Record<string, AgentMotionKind>>;
/** A gesture the agent emitted, located within its (cleaned) reply text. */
export interface AgentGestureEvent {
    /** The hand pose to play, for static-pose gestures. */
    pose?: SimulatorHandPose;
    /** The animated motion to play, for motion gestures (beat/wave/size/count). */
    motion?: AgentMotionKind;
    /** Optional parameter for a motion gesture, e.g. `big` for size, `2` for count. */
    param?: string;
    /** The raw gesture name from the markup. */
    name: string;
    /** Character index in the cleaned text where the gesture occurs. */
    index: number;
    /**
     * Optional target label for a spatial gesture, e.g. the object to point at
     * from markup like `[point:the table]`. Lowercased and trimmed.
     */
    target?: string;
}
/** The agent's reply with gesture markup stripped, plus the gestures found. */
export interface ParsedAgentSpeech {
    /** The reply text with all gesture markup removed. */
    text: string;
    /** The gestures, in order of appearance. */
    gestures: AgentGestureEvent[];
}
/**
 * Resolves a gesture name (e.g. "thumbs up", "point") to a hand pose.
 * @param name - The gesture name from the markup.
 * @returns The matching pose, or undefined if unknown.
 */
export declare function gestureNameToPose(name: string): SimulatorHandPose | undefined;
/**
 * Resolves a gesture name (e.g. "wave", "this big") to a motion kind.
 * @param name - The gesture name from the markup.
 * @returns The matching motion kind, or undefined if it is not a motion.
 */
export declare function gestureNameToMotion(name: string): AgentMotionKind | undefined;
/**
 * Parses an agent reply containing gesture markup such as
 * `"That one [gesture:point] over there."` into clean speech text plus the
 * gestures to play, each anchored to where it appeared in the text.
 * @param input - The raw agent reply.
 * @returns The cleaned text and the ordered gesture events.
 */
export declare function parseAgentGestures(input: string): ParsedAgentSpeech;
/**
 * One entry in the "executable dictionary" the animator plays: a gesture placed
 * on the speech timeline, with its point target already resolved to a world
 * position where applicable.
 */
export interface GestureStep {
    /** Seconds from the start of speech at which to play this step. */
    at: number;
    /** Character index in the spoken text, for word-boundary synchronization. */
    charIndex: number;
    /** The static hand pose to play, if any. */
    pose?: SimulatorHandPose;
    /** The animated motion to play, if any. */
    motion?: AgentMotionKind;
    /** Optional parameter for a motion gesture (e.g. `big`, `2`). */
    param?: string;
    /** Resolved world-space point to aim at, for a `[point:...]` gesture. */
    point?: THREE.Vector3;
}
/**
 * Resolves a point gesture's target label to a world position. Returns the
 * point to aim at, or null/undefined if the target is unknown.
 */
export type PointResolver = (target: string) => THREE.Vector3 | null | undefined;
/**
 * Turns parsed gestures into an ordered, timed list of {@link GestureStep}s
 * (the "executable dictionary"): each gesture is placed on the speech timeline
 * by its character offset, and a `[point:LABEL]` gesture is grounded to a world
 * position via `resolvePoint`.
 * @param text - The cleaned speech text the gestures were parsed from.
 * @param gestures - The gestures, in order of appearance.
 * @param duration - Estimated spoken duration of `text`, in seconds.
 * @param resolvePoint - Optional lookup from a point target label to a world
 *     position. Point gestures whose target does not resolve carry no point.
 * @returns The timed gesture steps.
 */
export declare function buildGestureSteps(text: string, gestures: AgentGestureEvent[], duration: number, resolvePoint?: PointResolver): GestureStep[];
