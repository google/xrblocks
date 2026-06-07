import * as THREE from 'three';

import {Handedness, JointName} from '../../Hands';
import {
  HandContext,
  HandLabel,
  JointPositions,
  PoseEstimator,
} from '../GestureTypes';

export type MediaPipeHandLandmark = {
  x: number;
  y: number;
  z?: number;
};

const MEDIAPIPE_JOINT_INDEX: Partial<Record<JointName, number>> = {
  wrist: 0,
  'thumb-metacarpal': 1,
  'thumb-phalanx-proximal': 2,
  'thumb-phalanx-distal': 3,
  'thumb-tip': 4,
  'index-finger-phalanx-proximal': 5,
  'index-finger-phalanx-intermediate': 6,
  'index-finger-phalanx-distal': 7,
  'index-finger-tip': 8,
  'middle-finger-phalanx-proximal': 9,
  'middle-finger-phalanx-intermediate': 10,
  'middle-finger-phalanx-distal': 11,
  'middle-finger-tip': 12,
  'ring-finger-phalanx-proximal': 13,
  'ring-finger-phalanx-intermediate': 14,
  'ring-finger-phalanx-distal': 15,
  'ring-finger-tip': 16,
  'pinky-finger-phalanx-proximal': 17,
  'pinky-finger-phalanx-intermediate': 18,
  'pinky-finger-phalanx-distal': 19,
  'pinky-finger-tip': 20,
};

const ESTIMATED_METACARPALS: Partial<Record<JointName, number>> = {
  'index-finger-metacarpal': 5,
  'middle-finger-metacarpal': 9,
  'ring-finger-metacarpal': 13,
  'pinky-finger-metacarpal': 17,
};

const METACARPAL_INTERPOLATION = 0.65;

export class MediaPipeHandContext implements HandContext {
  joints: JointPositions;

  constructor(
    public handedness: Handedness,
    public handLabel: HandLabel,
    landmarks: MediaPipeHandLandmark[]
  ) {
    this.joints = createJointMapFromLandmarks(landmarks);
  }

  getJoint(jointName: JointName) {
    return this.joints.get(jointName);
  }
}

export class MediaPipeHandPoseEstimator implements PoseEstimator {
  async init() {}

  getHandContext(_handedness: Handedness): HandContext | null {
    // TODO: map MediaPipe landmarks into canonical XR Blocks JointName positions.
    return null;
  }

  getHandContexts(): Partial<Record<'left' | 'right', HandContext>> {
    // TODO: return canonical contexts once MediaPipe landmark mapping is wired.
    return {};
  }
}

function createJointMapFromLandmarks(landmarks: MediaPipeHandLandmark[]) {
  const joints: JointPositions = new Map();
  for (const [jointName, index] of Object.entries(MEDIAPIPE_JOINT_INDEX)) {
    const landmark = landmarks[index];
    if (!landmark) continue;
    joints.set(jointName as JointName, landmarkToVector(landmark));
  }

  const wristLandmark = landmarks[0];
  if (!wristLandmark) return joints;

  for (const [jointName, index] of Object.entries(ESTIMATED_METACARPALS)) {
    const knuckleLandmark = landmarks[index];
    if (!knuckleLandmark) continue;

    const wrist = landmarkToVector(wristLandmark);
    const knuckle = landmarkToVector(knuckleLandmark);
    joints.set(
      jointName as JointName,
      wrist.lerp(knuckle, METACARPAL_INTERPOLATION)
    );
  }

  return joints;
}

function landmarkToVector(landmark: MediaPipeHandLandmark) {
  return new THREE.Vector3(
    0.5 - landmark.x,
    0.5 - landmark.y,
    -(landmark.z ?? 0)
  );
}
