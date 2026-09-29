import {Vector3} from 'three';
import type {Hands, Handedness, JointName} from 'xrblocks';
import type {HandFrame} from './Types';
import {assertVector} from './Types';

export const HAND_FEATURE_ID = 'xr-hand-palm-v1';
const joints: JointName[] = [
  'thumb-metacarpal',
  'thumb-phalanx-proximal',
  'thumb-phalanx-distal',
  'thumb-tip',
  ...(
    ['index-finger', 'middle-finger', 'ring-finger', 'pinky-finger'] as const
  ).flatMap((finger) =>
    ['phalanx-proximal', 'phalanx-intermediate', 'phalanx-distal', 'tip'].map(
      (part) => `${finger}-${part}` as JointName
    )
  ),
];
export const HAND_FEATURE_SIZE = joints.length * 3;

// Scratch values are private to synchronous capture; returned frames own their pose.
const points = joints.map(() => new Vector3());
const wrist = new Vector3();
const x = new Vector3();
const y = new Vector3();
const z = new Vector3();
const offset = new Vector3();

/** Copy normalized pose features directly from the SDK's tracked hand joints. */
export function captureHand(
  hands: Hands | undefined,
  handedness: Handedness,
  timeMs: number
): HandFrame | null {
  const handLabel =
    handedness === 0 ? 'left' : handedness === 1 ? 'right' : null;
  const tracked = hands?.hands[handedness];
  if (!handLabel || !tracked?.visible || !Number.isFinite(timeMs)) return null;
  const read = (name: JointName, target: Vector3) => {
    const joint = hands!.getJoint(name, handedness);
    if (!joint?.visible) return false;
    joint.getWorldPosition(target);
    return (
      Number.isFinite(target.x) &&
      Number.isFinite(target.y) &&
      Number.isFinite(target.z)
    );
  };
  if (!read('wrist', wrist)) return null;
  for (let i = 0; i < joints.length; i++) {
    if (!read(joints[i], points[i])) return null;
  }
  // The proximal index, middle and pinky joints are already in the pose.
  x.subVectors(points[4], points[16]);
  const size = x.length();
  if (size < 0.005) return null;
  x.divideScalar(size);
  y.subVectors(points[8], wrist);
  y.addScaledVector(x, -y.dot(x));
  if (y.length() < 0.005) return null;
  y.normalize();
  z.crossVectors(x, y);
  // The cross product changes sign under reflection; correct it anatomically.
  z.multiplyScalar(handLabel === 'left' ? -1 : 1);
  const pose = new Array<number>(HAND_FEATURE_SIZE);
  for (let i = 0; i < points.length; i++) {
    offset.subVectors(points[i], wrist).divideScalar(size);
    pose[i * 3] = offset.dot(x);
    pose[i * 3 + 1] = offset.dot(y);
    pose[i * 3 + 2] = offset.dot(z);
  }
  return {hand: handLabel, timeMs, pose};
}

export function validateFrames(frames: HandFrame[]) {
  if (!Array.isArray(frames) || frames.length < 1 || frames.length > 300) {
    throw new Error('Record 1–300 pose frames.');
  }
  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    if (
      !frame ||
      !['left', 'right'].includes(frame.hand) ||
      frame.hand !== frames[0].hand ||
      !Number.isFinite(frame.timeMs) ||
      (i > 0 && frame.timeMs <= frames[i - 1].timeMs)
    ) {
      throw new Error('A clip must contain one hand with increasing times.');
    }
    assertVector(frame.pose, HAND_FEATURE_SIZE);
  }
  if (frames.at(-1)!.timeMs - frames[0].timeMs > 10000)
    throw new Error('Clips must not exceed 10 seconds.');
}

export function poseFeatures(frames: HandFrame[]) {
  validateFrames(frames);
  return Array.from(
    {length: HAND_FEATURE_SIZE},
    (_, i) =>
      frames.reduce((sum, frame) => sum + frame.pose[i], 0) / frames.length
  );
}
