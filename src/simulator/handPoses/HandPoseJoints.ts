import type {JointName} from '../../input/Hands';
import {HAND_JOINT_NAMES} from '../../input/components/HandJointNames';

export type SimulatorHandPoseJoints = {
  t: number[];
  r: number[];
  s?: number[];
}[];

/**
 * Semantic biomechanical hand angles in radians, ordered as [x, y, z].
 *
 * Long fingers:
 * - x: positive flexes toward the palm; negative extends away.
 * - y: positive abducts away from the middle-finger axis; negative adducts.
 * - z: positive axial roll toward the thumb; negative rolls away.
 *
 * Middle finger:
 * - y: positive radial deviation toward index/thumb; negative ulnar deviation.
 *
 * Thumb:
 * - x: positive flexes across the palm; negative extends/repositions.
 * - y: positive palmar abduction away from the palm; negative adducts back.
 * - z: positive opposition/internal roll into the hand; negative repositions away.
 */
export type SimulatorHandJointRotationArray = [number, number, number];

export type SimulatorHandPoseRotations = Partial<
  Record<JointName, SimulatorHandJointRotationArray>
>;

export type SimulatorHandPoseRotationRangeDegrees = readonly [
  minDegrees: number,
  maxDegrees: number,
];

export type SimulatorHandPoseRotationConstraintsDegrees = Partial<
  Record<
    JointName,
    readonly [
      x: SimulatorHandPoseRotationRangeDegrees,
      y: SimulatorHandPoseRotationRangeDegrees,
      z: SimulatorHandPoseRotationRangeDegrees,
    ]
  >
>;

export const SIMULATOR_HAND_COMMON_BIOMECHANICAL_CONSTRAINTS_DEGREES = {
  'thumb-metacarpal': [
    [-10, 55],
    [-15, 45],
    [-20, 45],
  ],
  'thumb-phalanx-proximal': [
    [-10, 70],
    [-15, 15],
    [0, 0],
  ],
  'thumb-phalanx-distal': [
    [-15, 80],
    [0, 0],
    [0, 0],
  ],
  'index-finger-metacarpal': [
    [0, 0],
    [0, 0],
    [0, 0],
  ],
  'index-finger-phalanx-proximal': [
    [-30, 90],
    [-20, 20],
    [-10, 10],
  ],
  'index-finger-phalanx-intermediate': [
    [0, 110],
    [0, 0],
    [0, 0],
  ],
  'index-finger-phalanx-distal': [
    [0, 80],
    [0, 0],
    [0, 0],
  ],
  'middle-finger-metacarpal': [
    [0, 0],
    [0, 0],
    [0, 0],
  ],
  'middle-finger-phalanx-proximal': [
    [-30, 90],
    [-10, 10],
    [-10, 10],
  ],
  'middle-finger-phalanx-intermediate': [
    [0, 110],
    [0, 0],
    [0, 0],
  ],
  'middle-finger-phalanx-distal': [
    [0, 80],
    [0, 0],
    [0, 0],
  ],
  'ring-finger-metacarpal': [
    [0, 0],
    [0, 0],
    [0, 0],
  ],
  'ring-finger-phalanx-proximal': [
    [-30, 90],
    [-15, 15],
    [-10, 10],
  ],
  'ring-finger-phalanx-intermediate': [
    [0, 110],
    [0, 0],
    [0, 0],
  ],
  'ring-finger-phalanx-distal': [
    [0, 80],
    [0, 0],
    [0, 0],
  ],
  'pinky-finger-metacarpal': [
    [0, 0],
    [0, 0],
    [0, 0],
  ],
  'pinky-finger-phalanx-proximal': [
    [-30, 90],
    [-20, 20],
    [-10, 10],
  ],
  'pinky-finger-phalanx-intermediate': [
    [0, 110],
    [0, 0],
    [0, 0],
  ],
  'pinky-finger-phalanx-distal': [
    [0, 80],
    [0, 0],
    [0, 0],
  ],
} as const satisfies SimulatorHandPoseRotationConstraintsDegrees;

const HAND_JOINT_NAME_SET = new Set<string>(HAND_JOINT_NAMES);

export function parseSimulatorHandPoseRotations(
  json: unknown
): SimulatorHandPoseRotations {
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    return {};
  }

  const rotations: SimulatorHandPoseRotations = {};
  for (const [jointName, value] of Object.entries(json)) {
    if (!HAND_JOINT_NAME_SET.has(jointName)) continue;
    if (
      !Array.isArray(value) ||
      value.length !== 3 ||
      !value.every((axisValue) => typeof axisValue === 'number')
    ) {
      continue;
    }

    rotations[jointName as JointName] = [value[0], value[1], value[2]];
  }

  return rotations;
}
