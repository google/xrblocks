import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Handedness, SimulatorHandPose, type SimulatorHandPoseJoints } from 'xrblocks';
/** Public WebXR generic-hand rig used as the agent's hand mesh. */
export declare const AGENT_HAND_PROFILE_PATH = "https://cdn.jsdelivr.net/npm/@webxr-input-profiles/assets@1.0/dist/profiles/generic-hand/";
/**
 * Re-skins every mesh under `root` with the semi-transparent blue agent-hand
 * material. Extracted so it is testable without a GPU or a loaded GLB.
 * @param root - The loaded hand scene to recolor in place.
 */
export declare function applyAgentHandAppearance(root: THREE.Object3D): void;
/**
 * Smoothly moves a hand's bones toward a target set of joint transforms.
 * Extracted as a pure function so the animation step is testable without a GPU
 * or a loaded mesh.
 * @param bones - The hand's bones, aligned to {@link HAND_JOINT_NAMES}. Missing
 *     bones (undefined) are skipped.
 * @param joints - Target per-joint transforms (translation + rotation).
 * @param lerp - Interpolation factor in [0, 1]; 1 snaps to the target.
 */
export declare function lerpBonesToJoints(bones: ReadonlyArray<THREE.Object3D | undefined>, joints: Readonly<SimulatorHandPoseJoints>, lerp: number): void;
/**
 * A single, free-standing animatable hand (not tied to the user's tracked
 * input). Loads the WebXR generic-hand rig, then poses it each frame toward the
 * current {@link SimulatorHandPose} using the simulator pose library.
 */
export declare class AgentHand {
    readonly handedness: Handedness;
    /** Container to position/orient the whole hand in the scene. */
    readonly root: THREE.Group<THREE.Object3DEventMap>;
    /** Whether the mesh has finished loading. */
    loaded: boolean;
    private readonly bones;
    private pose;
    /** Orientation the root smoothly slerps toward (identity = resting). */
    private readonly targetQuaternion;
    /** Resting position (group-local), captured the first time the hand reaches. */
    private readonly homePosition;
    private homeCaptured;
    /** Position the root smoothly lerps toward (defaults to home). */
    private readonly reachPosition;
    private reaching;
    /**
     * Additive, parent-frame motion offset layered on top of the rest/reach
     * position (e.g. a beat bob or a size spread). Set externally each frame.
     */
    readonly motionOffset: THREE.Vector3;
    /**
     * Additive, parent-frame motion rotation layered on top of the rest/aim
     * orientation (e.g. a wave oscillation). Set externally each frame.
     */
    readonly motionQuaternion: THREE.Quaternion;
    constructor(handedness: Handedness);
    /**
     * Loads the hand mesh and collects its bones.
     * @param loader - Optional GLTFLoader to reuse.
     */
    load(loader?: GLTFLoader): Promise<void>;
    /** Sets the gesture the hand animates toward. */
    setPose(pose: SimulatorHandPose): void;
    /** The gesture the hand is currently animating toward. */
    get currentPose(): SimulatorHandPose;
    /**
     * Advances the hand one animation step toward its current pose.
     * @param lerp - Interpolation factor in [0, 1].
     */
    animate(lerp?: number): void;
    /**
     * Orients the hand so its index finger points at a world-space position,
     * reaches partway toward it, and switches to the pointing pose. The hand
     * smoothly turns and extends toward the target on subsequent
     * {@link animate} calls.
     * @param targetWorld - The world-space point to aim the index finger at.
     */
    aimAt(targetWorld: THREE.Vector3): void;
    /** Returns the hand to its resting position and orientation. */
    clearAim(): void;
    /**
     * Orients the hand toward an explicit parent-frame quaternion and stops
     * reaching, e.g. to present an emblematic gesture (thumbs up, victory)
     * upright by cancelling a resting tilt baked into the parent container.
     * Persists until {@link clearAim} or a subsequent {@link aimAt}/orient call.
     * @param parentQuaternion - Target orientation in the root's parent frame.
     */
    orient(parentQuaternion: THREE.Quaternion): void;
    /**
     * Writes the world-space position of the index fingertip into `out` (falls
     * back to the hand root if the bone is missing). Useful for drawing a pointer
     * ray from the fingertip.
     * @param out - Vector to write into.
     * @returns The same `out` vector.
     */
    getIndexTipWorld(out?: THREE.Vector3): THREE.Vector3;
    private captureHome_;
    private measurePointDirection_;
}
