import {describe, expect, it} from 'vitest';
import * as THREE from 'three';

import {Handedness} from '../../input/Hands';
import {HAND_JOINT_NAMES} from '../../input/components/HandJointNames';
import {SimulatorHandPose} from './HandPoses';
import {SIMULATOR_HAND_POSE_ROTATIONS} from './HandPoseRotations';
import {
  resolveSimulatorHandPoseRotations,
  resolveSimulatorRotationsFromKeypoints,
} from './HandPoseFK';

describe('HandPose Inverse Kinematics (IK)', () => {
  const poses = [
    SimulatorHandPose.NEUTRAL,
    SimulatorHandPose.RELAXED,
    SimulatorHandPose.PINCHING,
    SimulatorHandPose.FIST,
    SimulatorHandPose.THUMBS_UP,
    SimulatorHandPose.POINTING,
    SimulatorHandPose.ROCK,
    SimulatorHandPose.THUMBS_DOWN,
    SimulatorHandPose.VICTORY,
  ];

  const handednesses = [Handedness.LEFT, Handedness.RIGHT];

  for (const handedness of handednesses) {
    describe(`${handedness} hand poses`, () => {
      for (const pose of poses) {
        for (const applyConstraints of [false, true]) {
          it(`should accurately roundtrip ${pose} pose (applyConstraints: ${applyConstraints})`, () => {
            const originalRotations = SIMULATOR_HAND_POSE_ROTATIONS[pose];

            // Run FK to get joint positions.
            const joints = resolveSimulatorHandPoseRotations(
              handedness,
              originalRotations,
              applyConstraints
            );
            // Run IK to get rotations back from the keypoints.
            const computedRotations = resolveSimulatorRotationsFromKeypoints(
              handedness,
              joints,
              false
            );

            // Run FK again using the computed rotations.
            const recomputedJoints = resolveSimulatorHandPoseRotations(
              handedness,
              computedRotations,
              false
            );

            for (let i = 0; i < HAND_JOINT_NAMES.length; i++) {
              const jointName = HAND_JOINT_NAMES[i];
              const originalPos = new THREE.Vector3().fromArray(joints[i].t);
              const recomputedPos = new THREE.Vector3().fromArray(
                recomputedJoints[i].t
              );

              const distance = originalPos.distanceTo(recomputedPos);
              expect(
                distance,
                `Joint ${jointName} in pose ${pose} for ${handedness} hand should match original position (diff: ${distance}m)`
              ).toBeLessThan(1e-4);
            }
          });
        }
      }
    });
  }

  it('should enforce biomechanical constraints when applyConstraints = true', () => {
    // Let's create keypoints where the index finger PIP joint is hyperextended to -45 degrees (constraint is [0, 110] degrees).
    const rotations = {
      ...SIMULATOR_HAND_POSE_ROTATIONS[SimulatorHandPose.NEUTRAL],
      'index-finger-phalanx-intermediate': [-45 * (Math.PI / 180), 0, 0] as [
        number,
        number,
        number,
      ],
    };

    // Forward Kinematics (without constraints to force the hyperextension in position)
    const joints = resolveSimulatorHandPoseRotations(
      Handedness.LEFT,
      rotations,
      false
    );

    // Inverse Kinematics with constraints enabled
    const computedRotations = resolveSimulatorRotationsFromKeypoints(
      Handedness.LEFT,
      joints,
      true
    );

    // PIP intermediate joint should be clamped to its minimum constraint (0 degrees)
    const computedPipRot =
      computedRotations['index-finger-phalanx-intermediate']!;
    expect(computedPipRot[0]).toBeCloseTo(0, 1e-4);
  });

  it('should handle degenerate (all-zero or coincident) keypoints gracefully without NaNs', () => {
    // Create degenerate joints (all zero positions)
    const degenerateJoints = HAND_JOINT_NAMES.map(() => ({
      t: [0, 0, 0],
      r: [0, 0, 0, 1],
    }));

    const computedRotations = resolveSimulatorRotationsFromKeypoints(
      Handedness.LEFT,
      degenerateJoints,
      false
    );

    // Verify all returned rotations are valid numbers (no NaNs)
    for (const rotations of Object.values(computedRotations)) {
      expect(rotations[0]).not.toBeNaN();
      expect(rotations[1]).not.toBeNaN();
      expect(rotations[2]).not.toBeNaN();
    }
  });
});
