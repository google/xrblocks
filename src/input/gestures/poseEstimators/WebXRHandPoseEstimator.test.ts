import * as THREE from 'three';
import {WebXRController} from 'three/src/renderers/webxr/WebXRController.js';
import {describe, expect, it} from 'vitest';

import type {User} from '../../../core/User';
import {HAND_JOINT_NAMES} from '../../components/HandJointNames';
import {Handedness, Hands} from '../../Hands';
import {WebXRHandPoseEstimator} from './WebXRHandPoseEstimator';

function makeHand(visible: boolean): THREE.XRHandSpace {
  const hand = new WebXRController().getHandSpace();
  for (const name of HAND_JOINT_NAMES) {
    const joint = new THREE.Group() as THREE.XRJointSpace;
    hand.joints[name] = joint;
    hand.add(joint);
  }
  hand.visible = visible;
  hand.updateWorldMatrix(true, true);
  return hand;
}

describe('WebXRHandPoseEstimator', () => {
  it('ignores hidden hands and resumes when they become visible', () => {
    const hands = new Hands([makeHand(false), makeHand(true)]);
    const estimator = new WebXRHandPoseEstimator({hands} as User);

    expect(estimator.getHandContext(Handedness.LEFT)).toBeNull();
    expect(estimator.getHandContext(Handedness.RIGHT)).not.toBeNull();

    hands.hands[Handedness.LEFT].visible = true;
    expect(estimator.getHandContext(Handedness.LEFT)).not.toBeNull();

    hands.hands[Handedness.LEFT].visible = false;
    expect(estimator.getHandContext(Handedness.LEFT)).toBeNull();
  });
});
