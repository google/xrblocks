import * as THREE from 'three';

import {HAND_JOINT_NAMES} from './components/HandJointNames.js';

type JointName = typeof HAND_JOINT_NAMES[number];

/**
 * Utility class for managing WebXR hand tracking data based on
 * reported Handedness.
 */

/**
 * Enum for handedness, using WebXR standard strings.
 */
export enum Handedness {
  NONE = -1,  // Represents unknown or unspecified handedness
  LEFT = 0,
  RIGHT = 1,
}

/**
 * Represents and provides access to WebXR hand tracking data.
 * Uses the 'handedness' property of input hands for identification.
 */
export class Hands {
  dominant = Handedness.RIGHT;

  /**
   * @param hands - An array containing XRHandSpace objects from Three.js.
   */
  constructor(public hands: THREE.XRHandSpace[]) {}

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
  getJoint(jointName: JointName, targetHandednessEnum: Handedness) {
    let resolvedHandednessEnum = targetHandednessEnum;
    if (resolvedHandednessEnum === Handedness.NONE) {
      resolvedHandednessEnum = this.dominant;
    }

    const hand = this.hands[resolvedHandednessEnum];
    if (!hand) {
      console.log('no hand');
      return undefined;
    }

    if (!hand.joints || !(jointName in hand.joints)) {
      return undefined;
    }

    return hand.joints[jointName];
  }

  /**
   * Gets the index finger tip joint.
   * @param handedness - Optional handedness
   *     ('left'/'right'),
   * defaults to NONE (uses dominant hand).
   * @returns The joint object or null.
   */
  getIndexTip(handedness = Handedness.NONE) {
    return this.getJoint('index-finger-tip', handedness);
  }

  /**
   * Gets the thumb tip joint.
   * @param handedness - Optional handedness
   *     ('left'/'right'),
   * defaults to NONE (uses dominant hand).
   * @returns The joint object or null.
   */
  getThumbTip(handedness = Handedness.NONE) {
    return this.getJoint('thumb-tip', handedness);
  }

  /**
   * Gets the middle finger tip joint.
   * @param handedness - Optional handedness
   *     ('left'/'right'),
   * defaults to NONE (uses dominant hand).
   * @returns The joint object or null.
   */
  getMiddleTip(handedness = Handedness.NONE) {
    return this.getJoint('middle-finger-tip', handedness);
  }

  /**
   * Gets the ring finger tip joint.
   * @param handedness - Optional handedness
   *     ('left'/'right'),
   * defaults to NONE (uses dominant hand).
   * @returns The joint object or null.
   */
  getRingTip(handedness = Handedness.NONE) {
    return this.getJoint('ring-finger-tip', handedness);
  }

  /**
   * Gets the pinky finger tip joint.
   * @param handedness - Optional handedness
   *     ('left'/'right'),
   * defaults to NONE (uses dominant hand).
   * @returns The joint object or null.
   */
  getPinkyTip(handedness = Handedness.NONE) {
    return this.getJoint('pinky-finger-tip', handedness);
  }

  /**
   * Gets the wrist joint.
   * @param handedness - Optional handedness enum value
   *     (LEFT/RIGHT/NONE),
   * defaults to NONE (uses dominant hand).
   * @returns The joint object or null.
   */
  getWrist(handedness = Handedness.NONE) {
    return this.getJoint('wrist', handedness);
  }

  /**
   * Generates a string representation of the hand joint data for both hands.
   * Always lists LEFT hand data first, then RIGHT hand data, if available.
   * @returns A string containing position data for all available
   * joints.
   */
  toString() {
    let s = '';
    const orderedHandedness = [Handedness.LEFT, Handedness.RIGHT];

    orderedHandedness.forEach((handedness) => {
      const hand = this.hands[handedness];

      if (!hand || !hand.joints) {
        s += `${handedness} Hand: Data unavailable\n`;
        return;  // Continue to the next handedness
      }

      HAND_JOINT_NAMES.forEach((jointName) => {
        const joint = hand.joints[jointName];
        if (joint) {
          if (joint.position) {
            s += `${handedness} - ${jointName}: ${
                joint.position.x.toFixed(3)}, ${joint.position.y.toFixed(3)}, ${
                joint.position.z.toFixed(3)}\n`;
          } else {
            s += `${handedness} - ${jointName}: Position unavailable\n`;
          }
        } else {
          s += `${handedness} - ${jointName}: Joint unavailable\n`;
        }
      });
    });
    return s;
  }

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
  toPositionQuaternionArray() {
    const data = [];
    const orderedHandedness = [Handedness.LEFT, Handedness.RIGHT];
    const numJoints = HAND_JOINT_NAMES.length;
    const numValuesPerJoint = 7;  // 3 position + 4 quaternion

    orderedHandedness.forEach((handedness) => {
      const hand = this.hands[handedness];

      // Check if hand and joints data exist for this handedness
      const handDataAvailable = hand && hand.joints;

      HAND_JOINT_NAMES.forEach((jointName) => {
        const joint = handDataAvailable ? hand.joints[jointName] : null;

        // Check if specific joint and its properties exist
        if (joint && joint.position && joint.quaternion) {
          data.push(joint.position.x, joint.position.y, joint.position.z);
          data.push(
              joint.quaternion.x, joint.quaternion.y, joint.quaternion.z,
              joint.quaternion.w);
        } else {
          // If hand, joints, joint, or properties missing, push zeros
          for (let i = 0; i < numValuesPerJoint; i++) {
            data.push(0);
          }
        }
      });
    });

    // The final array should always have the same size
    const expectedSize =
        orderedHandedness.length * numJoints * numValuesPerJoint;
    if (data.length !== expectedSize) {
      // This case should theoretically not happen with the logic above,
      // but added as a safeguard during development/debugging.
      console.error(
          `XRHands.toPositionQuaternionArray: Output array size mismatch. Expected ${
              expectedSize}, got ${data.length}. Padding with zeros.`);
      // Pad with zeros if necessary, though ideally the logic prevents this
      while (data.length < expectedSize) {
        data.push(0);
      }
    }

    return data;
  }

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
  isValid(handIndex?: number): boolean {
    if (!this.hands || !Array.isArray(this.hands) || this.hands.length !== 2) {
      return false;
    }

    if (handIndex === 0 || handIndex === 1) {
      return !!this.hands[handIndex];
    }

    return !!this.hands[Handedness.LEFT] && !!this.hands[Handedness.RIGHT];
  }
}
