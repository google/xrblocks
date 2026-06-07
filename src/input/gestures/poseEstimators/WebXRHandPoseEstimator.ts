import * as THREE from 'three';

import {Handedness, JointName} from '../../Hands';
import {HAND_JOINT_NAMES} from '../../components/HandJointNames';
import {User} from '../../../core/User';
import {
  HAND_INDEX_TO_LABEL,
  HandLabel,
  HandContext,
  JointPositions,
  PoseEstimator,
} from '../GestureTypes';

export type WebXRJointRotations = Map<JointName, THREE.Quaternion>;

export class WebXRHandContext implements HandContext {
  constructor(
    public handedness: Handedness,
    public handLabel: HandLabel,
    public joints: JointPositions,
    public jointRotations: WebXRJointRotations
  ) {}

  getJoint(jointName: JointName) {
    return this.joints.get(jointName);
  }
}

export class WebXRHandPoseEstimator implements PoseEstimator {
  private user?: User;

  constructor(user?: User) {
    this.user = user;
  }

  init({user}: {user?: User} = {}) {
    if (user) this.user = user;
    return Promise.resolve();
  }

  getHandContext(handedness: Handedness) {
    if (!this.user?.hands) return null;
    const hand = this.user.hands.hands[handedness];
    const handLabel = HAND_INDEX_TO_LABEL[handedness];
    if (!hand?.joints || !handLabel) return null;

    const joints: JointPositions = new Map();
    const jointRotations: WebXRJointRotations = new Map();
    const position = new THREE.Vector3();
    const rotation = new THREE.Quaternion();
    const scale = new THREE.Vector3();

    for (const jointName of HAND_JOINT_NAMES) {
      const joint = hand.joints[jointName];
      if (!joint) continue;

      joint.matrixWorld.decompose(position, rotation, scale);
      joints.set(jointName, position.clone());
      jointRotations.set(jointName, rotation.clone());
    }

    if (!joints.size) return null;
    return new WebXRHandContext(handedness, handLabel, joints, jointRotations);
  }

  getHandContexts() {
    return {
      left: this.getHandContext(Handedness.LEFT) ?? undefined,
      right: this.getHandContext(Handedness.RIGHT) ?? undefined,
    };
  }
}
