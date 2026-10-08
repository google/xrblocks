import {Vector3} from 'three';
import type {Hands, Handedness, JointName} from 'xrblocks';
import {
  HAND_JOINTS,
  HAND_FEATURE_SIZE,
  PALM_INDEX_JOINT,
  PALM_MIDDLE_JOINT,
  PALM_PINKY_JOINT,
  MIN_PALM_AXIS_LENGTH,
  MAX_HAND_FRAMES,
  MAX_HAND_CLIP_DURATION_MS,
} from './constants';
import type {HandFrame} from './Types';
import {assertVector} from './Types';

// Scratch values are private to synchronous capture; returned frames own their pose.
const points = HAND_JOINTS.map(() => new Vector3());
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
  for (let i = 0; i < HAND_JOINTS.length; i++) {
    if (!read(HAND_JOINTS[i], points[i])) return null;
  }
  // The proximal index, middle and pinky joints are already in the pose.
  x.subVectors(points[PALM_INDEX_JOINT], points[PALM_PINKY_JOINT]);
  const size = x.length();
  if (size < MIN_PALM_AXIS_LENGTH) return null;
  x.divideScalar(size);
  y.subVectors(points[PALM_MIDDLE_JOINT], wrist);
  y.addScaledVector(x, -y.dot(x));
  if (y.length() < MIN_PALM_AXIS_LENGTH) return null;
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
  if (
    !Array.isArray(frames) ||
    frames.length < 1 ||
    frames.length > MAX_HAND_FRAMES
  ) {
    throw new Error(`Record 1–${MAX_HAND_FRAMES} pose frames.`);
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
  if (frames.at(-1)!.timeMs - frames[0].timeMs > MAX_HAND_CLIP_DURATION_MS)
    throw new Error(
      `Clips must not exceed ${MAX_HAND_CLIP_DURATION_MS / 1000} seconds.`
    );
}

export function poseFeatures(frames: HandFrame[]) {
  validateFrames(frames);
  return Array.from(
    {length: HAND_FEATURE_SIZE},
    (_, i) =>
      frames.reduce((sum, frame) => sum + frame.pose[i], 0) / frames.length
  );
}
