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

describe('Hand pose reconstruction', () => {
  it.each([
    [Handedness.LEFT, SimulatorHandPose.PINCHING],
    [Handedness.RIGHT, SimulatorHandPose.FIST],
  ] as const)('reconstructs the %s %s joint positions', (handedness, pose) => {
    const joints = resolveSimulatorHandPoseRotations(
      handedness,
      SIMULATOR_HAND_POSE_ROTATIONS[pose],
      true
    );
    const rotations = resolveSimulatorRotationsFromKeypoints(
      handedness,
      joints,
      false
    );
    const reconstructed = resolveSimulatorHandPoseRotations(
      handedness,
      rotations,
      false
    );
    for (const [index, joint] of joints.entries()) {
      expect(
        new THREE.Vector3()
          .fromArray(joint.t)
          .distanceTo(new THREE.Vector3().fromArray(reconstructed[index].t)),
        HAND_JOINT_NAMES[index]
      ).toBeLessThan(1e-4);
    }
  });

  it('limits a hyperextended finger when constraints are enabled', () => {
    const joints = resolveSimulatorHandPoseRotations(
      Handedness.LEFT,
      {
        ...SIMULATOR_HAND_POSE_ROTATIONS[SimulatorHandPose.NEUTRAL],
        'index-finger-phalanx-intermediate': [-Math.PI / 4, 0, 0],
      },
      false
    );
    const rotations = resolveSimulatorRotationsFromKeypoints(
      Handedness.LEFT,
      joints,
      true
    );
    expect(rotations['index-finger-phalanx-intermediate']![0]).toBeCloseTo(
      0,
      4
    );
  });

  it('returns finite rotations for coincident keypoints', () => {
    const joints = HAND_JOINT_NAMES.map(() => ({
      t: [0, 0, 0],
      r: [0, 0, 0, 1],
    }));
    const rotations = resolveSimulatorRotationsFromKeypoints(
      Handedness.LEFT,
      joints,
      false
    );
    expect(Object.values(rotations).flat().every(Number.isFinite)).toBe(true);
  });
});
