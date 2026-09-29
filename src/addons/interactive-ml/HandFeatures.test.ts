import {expect, it} from 'vitest';
import {Object3D} from 'three';
import type {XRHandSpace} from 'three';
import {Hands, Handedness} from '../../input/Hands';
import {HAND_JOINT_NAMES} from '../../input/components/HandJointNames';
import {captureHand} from './HandFeatures';

function trackedHand(mirror = 1) {
  const hand = new Object3D() as XRHandSpace;
  hand.joints = Object.fromEntries(
    HAND_JOINT_NAMES.map((name, i) => {
      const joint = new Object3D();
      joint.position.set(mirror * (i % 4) * 0.02, i * 0.01, 0.01);
      hand.add(joint);
      return [name, joint];
    })
  ) as XRHandSpace['joints'];
  hand.joints.wrist.position.set(0, 0, 0);
  hand.joints['index-finger-phalanx-proximal'].position.set(
    mirror * 0.04,
    0.04,
    0
  );
  hand.joints['middle-finger-phalanx-proximal'].position.set(0, 0.06, 0);
  hand.joints['pinky-finger-phalanx-proximal'].position.set(
    -mirror * 0.04,
    0.04,
    0
  );
  return hand;
}

it('normalizes mirrored hands and keeps returned frames independent of scratch values', () => {
  const left = trackedHand(-1);
  const right = trackedHand();
  const hands = new Hands([left, right]);
  const frame = captureHand(hands, Handedness.RIGHT, 1)!;
  const copy = frame.pose.slice();
  const mirrored = captureHand(hands, Handedness.LEFT, 2)!;
  mirrored.pose.forEach((value, i) => expect(value).toBeCloseTo(copy[i]));
  right.position.set(3, 4, 5);
  right.rotation.set(0.3, 0.7, 0.2);
  right.scale.setScalar(2);
  const transformed = captureHand(hands, Handedness.RIGHT, 3)!;
  transformed.pose.forEach((value, i) => expect(value).toBeCloseTo(copy[i]));
  expect(frame.pose).toEqual(copy);
});

it('rejects missing tracking and degenerate palm geometry', () => {
  const right = trackedHand();
  const hands = new Hands([trackedHand(-1), right]);
  right.joints['thumb-tip'].visible = false;
  expect(captureHand(hands, Handedness.RIGHT, 1)).toBeNull();
  right.joints['thumb-tip'].visible = true;
  right.joints['index-finger-phalanx-proximal'].position.copy(
    right.joints['pinky-finger-phalanx-proximal'].position
  );
  expect(captureHand(hands, Handedness.RIGHT, 1)).toBeNull();
  expect(captureHand(undefined, Handedness.RIGHT, 1)).toBeNull();
});
