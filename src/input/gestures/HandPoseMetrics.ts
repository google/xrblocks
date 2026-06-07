import * as THREE from 'three';

import {
  HAND_BONE_IDX_CONNECTION_MAP,
  HAND_JOINT_IDX_CONNECTION_MAP,
} from '../../constants';
import type {JointName} from '../Hands';
import {HAND_JOINT_NAMES} from '../components/HandJointNames';
import type {HandContext} from './GestureTypes';

export type FingerName = 'index' | 'middle' | 'ring' | 'pinky';
export type DigitName = 'thumb' | FingerName;

export type PalmPose = {
  center: THREE.Vector3;
  width: number;
  normal: THREE.Vector3;
  right: THREE.Vector3;
  up: THREE.Vector3;
};

export const FINGER_ORDER: FingerName[] = ['index', 'middle', 'ring', 'pinky'];

const FINGER_PREFIX: Record<FingerName, string> = {
  index: 'index-finger',
  middle: 'middle-finger',
  ring: 'ring-finger',
  pinky: 'pinky-finger',
};

const DIGIT_JOINTS: Record<DigitName, JointName[]> = {
  thumb: [
    'thumb-metacarpal',
    'thumb-phalanx-proximal',
    'thumb-phalanx-distal',
    'thumb-tip',
  ],
  index: [
    'index-finger-metacarpal',
    'index-finger-phalanx-proximal',
    'index-finger-phalanx-intermediate',
    'index-finger-phalanx-distal',
    'index-finger-tip',
  ],
  middle: [
    'middle-finger-metacarpal',
    'middle-finger-phalanx-proximal',
    'middle-finger-phalanx-intermediate',
    'middle-finger-phalanx-distal',
    'middle-finger-tip',
  ],
  ring: [
    'ring-finger-metacarpal',
    'ring-finger-phalanx-proximal',
    'ring-finger-phalanx-intermediate',
    'ring-finger-phalanx-distal',
    'ring-finger-tip',
  ],
  pinky: [
    'pinky-finger-metacarpal',
    'pinky-finger-phalanx-proximal',
    'pinky-finger-phalanx-intermediate',
    'pinky-finger-phalanx-distal',
    'pinky-finger-tip',
  ],
};

const EPSILON = 1e-6;

export function getFingerJoint(
  context: HandContext,
  finger: FingerName,
  suffix: string
) {
  const prefix = FINGER_PREFIX[finger];
  return context.getJoint(`${prefix}-${suffix}` as JointName);
}

export function estimateHandScale(context: HandContext) {
  const wrist = context.getJoint('wrist');
  const middleTip = context.getJoint('middle-finger-tip');
  const palmWidth = getPalmWidth(context);

  const measurements: number[] = [];
  if (wrist && middleTip) measurements.push(middleTip.distanceTo(wrist));
  if (palmWidth) measurements.push(palmWidth);

  if (!measurements.length) return 0.08;
  return average(measurements);
}

export function getPalmWidth(context: HandContext) {
  const indexBase = getFingerJoint(context, 'index', 'metacarpal');
  const pinkyBase = getFingerJoint(context, 'pinky', 'metacarpal');
  if (!indexBase || !pinkyBase) return null;
  return indexBase.distanceTo(pinkyBase);
}

export function getPalmNormal(context: HandContext) {
  const wrist = context.getJoint('wrist');
  const indexBase = getFingerJoint(context, 'index', 'metacarpal');
  const pinkyBase = getFingerJoint(context, 'pinky', 'metacarpal');
  if (!wrist || !indexBase || !pinkyBase) return null;

  const u = new THREE.Vector3().subVectors(indexBase, wrist);
  const v = new THREE.Vector3().subVectors(pinkyBase, wrist);
  if (u.lengthSq() === 0 || v.lengthSq() === 0) return null;

  const normal = new THREE.Vector3().crossVectors(u, v);
  if (normal.lengthSq() === 0) return null;
  if (context.handLabel === 'left') normal.multiplyScalar(-1);
  return normal.normalize();
}

export function getPalmRight(context: HandContext) {
  const indexBase = getFingerJoint(context, 'index', 'metacarpal');
  const pinkyBase = getFingerJoint(context, 'pinky', 'metacarpal');
  if (!indexBase || !pinkyBase) return null;
  const right = new THREE.Vector3().subVectors(indexBase, pinkyBase);
  if (context.handLabel === 'left') right.multiplyScalar(-1);
  if (right.lengthSq() === 0) return null;
  return right.normalize();
}

export function getPalmUp(context: HandContext) {
  const normal = getPalmNormal(context);
  const right = getPalmRight(context);
  if (!normal || !right) return null;

  const up = new THREE.Vector3().copy(right).cross(normal);
  if (up.lengthSq() === 0) return null;
  return up.normalize();
}

export function getPalmPose(context: HandContext): PalmPose | null {
  const wrist = context.getJoint('wrist');
  const indexBase = getFingerJoint(context, 'index', 'metacarpal');
  const pinkyBase = getFingerJoint(context, 'pinky', 'metacarpal');
  const width = getPalmWidth(context);
  const normal = getPalmNormal(context);
  const right = getPalmRight(context);
  const up = getPalmUp(context);

  if (
    !wrist ||
    !indexBase ||
    !pinkyBase ||
    !width ||
    !normal ||
    !right ||
    !up
  ) {
    return null;
  }

  const center = new THREE.Vector3()
    .add(wrist)
    .add(indexBase)
    .add(pinkyBase)
    .multiplyScalar(1 / 3);

  return {center, width, normal, right, up};
}

export function getFingerBendAngles(context: HandContext, finger: FingerName) {
  return getDigitBendAngles(context, finger);
}

export function getFingerStraightness(
  context: HandContext,
  finger: FingerName
) {
  return getDigitStraightness(context, finger);
}

export function getFingerCurl(context: HandContext, finger: FingerName) {
  return 1 - getFingerStraightness(context, finger);
}

export function getFingerDirection(context: HandContext, finger: FingerName) {
  return getDigitDirection(context, finger);
}

export function getFingerPalmAlignment(
  context: HandContext,
  finger: FingerName
) {
  const direction = getFingerDirection(context, finger);
  const palmUp = getPalmUp(context);
  if (!direction || !palmUp) return 0;
  return clamp01((direction.dot(palmUp) - 0.2) / 0.8);
}

export function getFingerSpread(
  context: HandContext,
  fingerA: FingerName,
  fingerB: FingerName
) {
  const directionA = getFingerDirection(context, fingerA);
  const directionB = getFingerDirection(context, fingerB);
  if (!directionA || !directionB) return 0;
  return clamp01((1 - directionA.dot(directionB)) / 0.45);
}

export function getAdjacentFingerSpreads(context: HandContext) {
  return {
    indexMiddle: getFingerSpread(context, 'index', 'middle'),
    middleRing: getFingerSpread(context, 'middle', 'ring'),
    ringPinky: getFingerSpread(context, 'ring', 'pinky'),
  };
}

export function getThumbBendAngles(context: HandContext) {
  return getDigitBendAngles(context, 'thumb');
}

export function getThumbStraightness(context: HandContext) {
  return getDigitStraightness(context, 'thumb');
}

export function getThumbCurl(context: HandContext) {
  return 1 - getThumbStraightness(context);
}

export function getThumbDirection(context: HandContext) {
  return getDigitDirection(context, 'thumb');
}

export function getThumbOpposition(
  context: HandContext,
  finger: FingerName = 'index'
) {
  const distance = getFingertipDistance(context, 'thumb', finger);
  const scale = getPalmWidth(context) ?? estimateHandScale(context);
  if (distance === null || scale < EPSILON) return 0;
  return clamp01(1 - distance / (scale * 0.7));
}

export function getThumbVerticalDirection(context: HandContext) {
  const direction = getThumbDirection(context);
  if (!direction) return 0;
  return direction.y;
}

export function getFingertipDistance(
  context: HandContext,
  digitA: DigitName,
  digitB: DigitName
) {
  const tipA = getDigitTip(context, digitA);
  const tipB = getDigitTip(context, digitB);
  if (!tipA || !tipB) return null;
  return tipA.distanceTo(tipB);
}

export function getFingertipPalmDistance(
  context: HandContext,
  digit: DigitName
) {
  const tip = getDigitTip(context, digit);
  const palmPose = getPalmPose(context);
  if (!tip || !palmPose) return null;
  return tip.distanceTo(palmPose.center);
}

export function getBoneVectors(context: HandContext) {
  return HAND_JOINT_IDX_CONNECTION_MAP.map(([joint1, joint2]) => {
    const start = context.getJoint(HAND_JOINT_NAMES[joint1]);
    const end = context.getJoint(HAND_JOINT_NAMES[joint2]);
    if (!start || !end) return new THREE.Vector3();

    const boneVector = new THREE.Vector3().subVectors(end, start);
    if (boneVector.lengthSq() === 0) return boneVector;
    return boneVector.normalize();
  });
}

export function getRelativeBoneAngles(context: HandContext) {
  const boneVectors = getBoneVectors(context);
  const angles = new Float32Array(HAND_BONE_IDX_CONNECTION_MAP.length);
  HAND_BONE_IDX_CONNECTION_MAP.forEach(([bone1, bone2], index) => {
    angles[index] = boneVectors[bone1].dot(boneVectors[bone2]);
  });
  return angles;
}

export function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export function clamp01(value: number) {
  return THREE.MathUtils.clamp(value, 0, 1);
}

function getDigitBendAngles(context: HandContext, digit: DigitName) {
  const segments = getDigitSegmentDirections(context, digit);
  if (!segments || segments.length < 2) return [];

  const angles: number[] = [];
  for (let i = 0; i < segments.length - 1; i++) {
    angles.push(segments[i].dot(segments[i + 1]));
  }
  return angles;
}

function getDigitStraightness(context: HandContext, digit: DigitName) {
  const bendAngles = getDigitBendAngles(context, digit);
  if (!bendAngles.length) return 0;
  return average(bendAngles.map(normalizeStraightness));
}

function getDigitDirection(context: HandContext, digit: DigitName) {
  const base = getDigitBase(context, digit);
  const tip = getDigitTip(context, digit);
  if (!base || !tip) return null;

  const direction = new THREE.Vector3().subVectors(tip, base);
  if (direction.lengthSq() === 0) return null;
  return direction.normalize();
}

function getDigitBase(context: HandContext, digit: DigitName) {
  return context.getJoint(DIGIT_JOINTS[digit][0]);
}

function getDigitTip(context: HandContext, digit: DigitName) {
  return context.getJoint(DIGIT_JOINTS[digit][DIGIT_JOINTS[digit].length - 1]);
}

function getDigitSegmentDirections(context: HandContext, digit: DigitName) {
  const joints = DIGIT_JOINTS[digit]
    .map((jointName) => context.getJoint(jointName))
    .filter(Boolean) as THREE.Vector3[];

  if (joints.length !== DIGIT_JOINTS[digit].length) return null;

  const segments: THREE.Vector3[] = [];
  for (let i = 0; i < joints.length - 1; i++) {
    const segment = new THREE.Vector3().subVectors(joints[i + 1], joints[i]);
    if (segment.lengthSq() === 0) return null;
    segments.push(segment.normalize());
  }
  return segments;
}

function normalizeStraightness(bendCosine: number) {
  return clamp01((bendCosine - 0.55) / 0.4);
}
