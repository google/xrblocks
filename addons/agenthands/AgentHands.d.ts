import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Script, SimulatorHandPose } from 'xrblocks';
import { AgentHand } from './AgentHand';
/** Which hand(s) a gesture applies to. */
export type AgentHandSelector = 'left' | 'right' | 'both';
/**
 * A free-standing pair of agent hands that gesture in the scene. Owns a left
 * and right {@link AgentHand}, loads both, and animates them toward their
 * current poses every frame. Position/orient the whole pair by moving this
 * Script (it is a `THREE.Object3D`); the app decides where the hands sit
 * relative to the user.
 */
export declare class AgentHands extends Script {
    readonly left: AgentHand;
    readonly right: AgentHand;
    /** Per-frame interpolation factor toward the target pose. */
    lerp: number;
    /** Whether both hands have finished loading. */
    loaded: boolean;
    private beatMotion;
    private waveMotion;
    private sizeMotion;
    private lastNowMs;
    /**
     * Loads both hand meshes and parents them under this object.
     * @param loader - Optional shared GLTFLoader.
     */
    load(loader?: GLTFLoader): Promise<void>;
    /**
     * Sets the gesture one or both hands animate toward.
     * @param pose - The target hand pose.
     * @param hand - Which hand(s) to apply it to. Defaults to both.
     */
    gesture(pose: SimulatorHandPose, hand?: AgentHandSelector): void;
    /**
     * Sets an explicit presentation orientation on one or both hands (parent
     * frame), e.g. to show an emblematic gesture upright. Cleared by {@link rest}.
     * @param parentQuaternion - Target orientation in each hand-root's parent.
     * @param hand - Which hand(s) to orient. Defaults to both.
     */
    orient(parentQuaternion: THREE.Quaternion, hand?: AgentHandSelector): void;
    /** Clears any aim/orientation override, returning hands to the parent tilt. */
    clearOrientation(hand?: AgentHandSelector): void;
    /** Relaxes both hands to a neutral resting pose. */
    rest(): void;
    /**
     * Plays a beat gesture: a quick downward bob, the rhythmic emphasis that
     * accompanies stressed words in natural speech.
     * @param hand - Which hand(s) bob. Defaults to both.
     */
    beat(hand?: AgentHandSelector): void;
    /**
     * Plays a wave gesture: the hand rises and oscillates side to side, e.g. a
     * greeting on "hi" or "hello".
     * @param hand - Which hand waves. Defaults to the right.
     */
    wave(hand?: AgentHandSelector): void;
    /**
     * Plays an iconic size gesture: the two hands spread apart to depict how big
     * something is, then return.
     * @param width - Peak separation added between the hands, in metres.
     */
    showSize(width?: number): void;
    /**
     * Holds up a number of fingers (a deictic/enumerative gesture). The rig's
     * pose library supports one and two cleanly; larger counts show an open hand.
     * @param n - How many to indicate.
     */
    showCount(n: number): void;
    /**
     * Points a hand at a world-space position (e.g. a detected object). The hand
     * switches to the pointing pose and turns to aim its index finger at the
     * target.
     * @param targetWorld - The world-space point to point at.
     * @param hand - Which hand to point with. 'both' uses the hand on the same
     *     side as the target. Defaults to 'both'.
     */
    pointAt(targetWorld: THREE.Vector3, hand?: AgentHandSelector): void;
    private updateMotions_;
    update(): void;
}
