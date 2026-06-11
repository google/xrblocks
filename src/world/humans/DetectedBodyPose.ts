import * as THREE from 'three';

export enum PoseJointName {
  Nose = 'nose',
  LeftEye = 'leftEye',
  RightEye = 'rightEye',
  LeftEar = 'leftEar',
  RightEar = 'rightEar',
  LeftShoulder = 'leftShoulder',
  RightShoulder = 'rightShoulder',
  LeftElbow = 'leftElbow',
  RightElbow = 'rightElbow',
  LeftWrist = 'leftWrist',
  RightWrist = 'rightWrist',
  LeftHip = 'leftHip',
  RightHip = 'rightHip',
  LeftKnee = 'leftKnee',
  RightKnee = 'rightKnee',
  LeftAnkle = 'leftAnkle',
  RightAnkle = 'rightAnkle',
  LeftFoot = 'leftFoot',
  RightFoot = 'rightFoot',
  Hips = 'hips',
  Spine = 'spine',
  Chest = 'chest',
  Neck = 'neck',
  Head = 'head',
}

export interface PoseLandmark {
  x: number; // normalized x [0, 1]
  y: number; // normalized y [0, 1]
  z: number; // raw z / depth estimation
  visibility?: number;
  worldPosition?: THREE.Vector3; // backprojected 3D WebXR position
}

export class DetectedBodyPose extends THREE.Object3D {
  constructor(
    public poseId: number,
    public landmarks: PoseLandmark[],
    public detection2DBoundingBox: THREE.Box2,
    public score: number
  ) {
    super();
    // Default the Object3D position to the estimated hips/center
    const hipsPos = this.getJointPosition(PoseJointName.Hips);
    if (hipsPos) {
      this.position.copy(hipsPos);
    }
  }

  /**
   * Returns the 3D world space position of a specific joint/landmark.
   * Exposes both standard MediaPipe landmark mappings and composite VRM/humanoid landmarks.
   */
  getJointPosition(name: PoseJointName | string): THREE.Vector3 | null {
    const getMPWorldPos = (index: number): THREE.Vector3 | null => {
      const lm = this.landmarks[index];
      return lm && lm.worldPosition ? lm.worldPosition.clone() : null;
    };

    switch (name) {
      case PoseJointName.Nose:
        return getMPWorldPos(0);
      case PoseJointName.LeftEye:
        return getMPWorldPos(2);
      case PoseJointName.RightEye:
        return getMPWorldPos(5);
      case PoseJointName.LeftEar:
        return getMPWorldPos(7);
      case PoseJointName.RightEar:
        return getMPWorldPos(8);
      case PoseJointName.LeftShoulder:
        return getMPWorldPos(11);
      case PoseJointName.RightShoulder:
        return getMPWorldPos(12);
      case PoseJointName.LeftElbow:
        return getMPWorldPos(13);
      case PoseJointName.RightElbow:
        return getMPWorldPos(14);
      case PoseJointName.LeftWrist:
        return getMPWorldPos(15);
      case PoseJointName.RightWrist:
        return getMPWorldPos(16);
      case PoseJointName.LeftHip:
        return getMPWorldPos(23);
      case PoseJointName.RightHip:
        return getMPWorldPos(24);
      case PoseJointName.LeftKnee:
        return getMPWorldPos(25);
      case PoseJointName.RightKnee:
        return getMPWorldPos(26);
      case PoseJointName.LeftAnkle:
        return getMPWorldPos(27);
      case PoseJointName.RightAnkle:
        return getMPWorldPos(28);
      case PoseJointName.LeftFoot:
        return getMPWorldPos(31);
      case PoseJointName.RightFoot:
        return getMPWorldPos(32);

      // Composite virtual bones for VRM skeleton compatibility:
      case PoseJointName.Hips: {
        const lHip = getMPWorldPos(23);
        const rHip = getMPWorldPos(24);
        if (lHip && rHip) {
          return new THREE.Vector3().addVectors(lHip, rHip).multiplyScalar(0.5);
        }
        return lHip || rHip || null;
      }
      case PoseJointName.Spine: {
        // Spine is lower center torso (between hips and chest)
        const hips = this.getJointPosition(PoseJointName.Hips);
        const chest = this.getJointPosition(PoseJointName.Chest);
        if (hips && chest) {
          return new THREE.Vector3()
            .addVectors(hips, chest)
            .multiplyScalar(0.5);
        }
        return hips || chest || null;
      }
      case PoseJointName.Chest: {
        const lShoulder = getMPWorldPos(11);
        const rShoulder = getMPWorldPos(12);
        if (lShoulder && rShoulder) {
          return new THREE.Vector3()
            .addVectors(lShoulder, rShoulder)
            .multiplyScalar(0.5);
        }
        return lShoulder || rShoulder || null;
      }
      case PoseJointName.Neck: {
        const chest = this.getJointPosition(PoseJointName.Chest);
        const nose = getMPWorldPos(0);
        if (chest && nose) {
          return new THREE.Vector3()
            .addVectors(chest, nose)
            .multiplyScalar(0.5);
        }
        return chest || nose || null;
      }
      case PoseJointName.Head: {
        const nose = getMPWorldPos(0);
        const lEar = getMPWorldPos(7);
        const rEar = getMPWorldPos(8);
        if (nose && lEar && rEar) {
          const midEar = new THREE.Vector3()
            .addVectors(lEar, rEar)
            .multiplyScalar(0.5);
          return new THREE.Vector3()
            .addVectors(nose, midEar)
            .multiplyScalar(0.5);
        }
        return nose || lEar || rEar || null;
      }
    }
    return null;
  }
}
