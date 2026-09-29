import {Vector3} from 'three';
import type {HandContext, JointName} from 'xrblocks';
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

/** Returns null for missing or degenerate joints. Does not retain the context. */
export function captureHand(
  context: HandContext,
  timeMs: number
): HandFrame | null {
  const wrist = context.getJoint('wrist');
  const index = context.getJoint('index-finger-phalanx-proximal');
  const pinky = context.getJoint('pinky-finger-phalanx-proximal');
  const middle = context.getJoint('middle-finger-phalanx-proximal');
  const points = joints.map((name) => context.getJoint(name));
  if (
    !Number.isFinite(timeMs) ||
    !wrist ||
    !index ||
    !pinky ||
    !middle ||
    points.some((point) => !point) ||
    [wrist, ...points].some((p) => !p || !p.toArray().every(Number.isFinite))
  )
    return null;
  const x = new Vector3().subVectors(index, pinky);
  const size = x.length();
  if (size < 0.005) return null;
  x.divideScalar(size);
  const y = new Vector3().subVectors(middle, wrist);
  y.addScaledVector(x, -y.dot(x));
  if (y.length() < 0.005) return null;
  y.normalize();
  const z = new Vector3().crossVectors(x, y);
  // The cross product changes sign under reflection; correct it anatomically.
  z.multiplyScalar(context.handLabel === 'left' ? -1 : 1);
  const offset = new Vector3();
  const pose = points.flatMap((point) => {
    offset.subVectors(point!, wrist).divideScalar(size);
    return [offset.dot(x), offset.dot(y), offset.dot(z)];
  });
  return {
    hand: context.handLabel,
    timeMs,
    pose,
  };
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
