import * as THREE from 'three';
import { HAND_JOINT_NAMES } from './components/HandJointNames.js';
type JointName = typeof HAND_JOINT_NAMES[number];
/**
 * Utility class for managing WebXR hand tracking data based on
 * reported Handedness.
 */
/**
 * Enum for handedness, using WebXR standard strings.
 */
export declare enum Handedness {
    NONE = -1,// Represents unknown or unspecified handedness
    LEFT = 0,
    RIGHT = 1
}
/**
 * Represents and provides access to WebXR hand tracking data.
 * Uses the 'handedness' property of input hands for identification.
 */
export declare class Hands {
    hands: THREE.XRHandSpace[];
    dominant: Handedness;
    /**
     * @param hands - An array containing XRHandSpace objects from Three.js.
     */
    constructor(hands: THREE.XRHandSpace[]);
    /**
     * Retrieves a specific joint object for a given hand.
     * @param jointName - The name of the joint to retrieve (e.g.,
     *     'index-finger-tip').
     * @param targetHandednessEnum - The hand enum value
     *     (Handedness.LEFT or Handedness.RIGHT)
     *        to retrieve the joint from. If Handedness.NONE, uses the dominant
     * hand.
     * @returns The requested joint object, or null if not
     *     found or invalid input.
     */
    getJoint(jointName: JointName, targetHandednessEnum: Handedness): THREE.XRJointSpace | undefined;
    /**
     * Gets the index finger tip joint.
     * @param handedness - Optional handedness
     *     ('left'/'right'),
     * defaults to NONE (uses dominant hand).
     * @returns The joint object or null.
     */
    getIndexTip(handedness?: Handedness): THREE.XRJointSpace | undefined;
    /**
     * Gets the thumb tip joint.
     * @param handedness - Optional handedness
     *     ('left'/'right'),
     * defaults to NONE (uses dominant hand).
     * @returns The joint object or null.
     */
    getThumbTip(handedness?: Handedness): THREE.XRJointSpace | undefined;
    /**
     * Gets the middle finger tip joint.
     * @param handedness - Optional handedness
     *     ('left'/'right'),
     * defaults to NONE (uses dominant hand).
     * @returns The joint object or null.
     */
    getMiddleTip(handedness?: Handedness): THREE.XRJointSpace | undefined;
    /**
     * Gets the ring finger tip joint.
     * @param handedness - Optional handedness
     *     ('left'/'right'),
     * defaults to NONE (uses dominant hand).
     * @returns The joint object or null.
     */
    getRingTip(handedness?: Handedness): THREE.XRJointSpace | undefined;
    /**
     * Gets the pinky finger tip joint.
     * @param handedness - Optional handedness
     *     ('left'/'right'),
     * defaults to NONE (uses dominant hand).
     * @returns The joint object or null.
     */
    getPinkyTip(handedness?: Handedness): THREE.XRJointSpace | undefined;
    /**
     * Gets the wrist joint.
     * @param handedness - Optional handedness enum value
     *     (LEFT/RIGHT/NONE),
     * defaults to NONE (uses dominant hand).
     * @returns The joint object or null.
     */
    getWrist(handedness?: Handedness): THREE.XRJointSpace | undefined;
    /**
     * Generates a string representation of the hand joint data for both hands.
     * Always lists LEFT hand data first, then RIGHT hand data, if available.
     * @returns A string containing position data for all available
     * joints.
     */
    toString(): string;
    /**
     * Converts the pose data (position and quaternion) of all joints for both
     * hands into a single flat array. Each joint is represented by 7 numbers
     * (3 for position, 4 for quaternion). Missing joints or hands are represented
     * by zeros. Ensures a consistent output order: all left hand joints first,
     * then all right hand joints.
     * @returns A flat array containing position (x, y, z) and
     * quaternion (x, y, z, w) data for all joints, ordered [left...,
     * right...]. Size is always 2 * HAND_JOINT_NAMES.length * 7.
     */
    toPositionQuaternionArray(): number[];
    /**
     * Checks for the availability of hand data.
     * If an integer (0 for LEFT, 1 for RIGHT) is provided, it checks for that
     * specific hand. If no integer is provided, it checks that data for *both*
     * hands is available.
     * @param handIndex - Optional. The index of the hand to validate
     *     (0 or 1).
     * @returns `true` if the specified hand(s) have data, `false`
     *     otherwise.
     */
    isValid(handIndex?: number): boolean;
}
export {};
