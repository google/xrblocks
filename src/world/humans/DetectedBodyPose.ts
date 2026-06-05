import * as THREE from 'three';

export type PoseJointName =
  | 'nose'
  | 'leftEye'
  | 'rightEye'
  | 'leftEar'
  | 'rightEar'
  | 'leftShoulder'
  | 'rightShoulder'
  | 'leftElbow'
  | 'rightElbow'
  | 'leftWrist'
  | 'rightWrist'
  | 'leftHip'
  | 'rightHip'
  | 'leftKnee'
  | 'rightKnee'
  | 'leftAnkle'
  | 'rightAnkle'
  | 'leftFoot'
  | 'rightFoot'
  | 'hips'
  | 'spine'
  | 'chest'
  | 'neck'
  | 'head';

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
    const hipsPos = this.getJointPosition('hips');
    if (hipsPos) {
      this.position.copy(hipsPos);
    }
  }

  /**
   * Returns the 3D world space position of a specific joint/landmark.
   * Exposes both standard MediaPipe landmark mappings and composite VRM/humanoid landmarks.
   */
  getJointPosition(name: PoseJointName): THREE.Vector3 | null {
    const getMPWorldPos = (index: number): THREE.Vector3 | null => {
      const lm = this.landmarks[index];
      return lm && lm.worldPosition ? lm.worldPosition.clone() : null;
    };

    switch (name) {
      case 'nose':
        return getMPWorldPos(0);
      case 'leftEye':
        return getMPWorldPos(2);
      case 'rightEye':
        return getMPWorldPos(5);
      case 'leftEar':
        return getMPWorldPos(7);
      case 'rightEar':
        return getMPWorldPos(8);
      case 'leftShoulder':
        return getMPWorldPos(11);
      case 'rightShoulder':
        return getMPWorldPos(12);
      case 'leftElbow':
        return getMPWorldPos(13);
      case 'rightElbow':
        return getMPWorldPos(14);
      case 'leftWrist':
        return getMPWorldPos(15);
      case 'rightWrist':
        return getMPWorldPos(16);
      case 'leftHip':
        return getMPWorldPos(23);
      case 'rightHip':
        return getMPWorldPos(24);
      case 'leftKnee':
        return getMPWorldPos(25);
      case 'rightKnee':
        return getMPWorldPos(26);
      case 'leftAnkle':
        return getMPWorldPos(27);
      case 'rightAnkle':
        return getMPWorldPos(28);
      case 'leftFoot':
        return getMPWorldPos(31);
      case 'rightFoot':
        return getMPWorldPos(32);

      // Composite virtual bones for VRM skeleton compatibility:
      case 'hips': {
        const lHip = getMPWorldPos(23);
        const rHip = getMPWorldPos(24);
        if (lHip && rHip) {
          return new THREE.Vector3().addVectors(lHip, rHip).multiplyScalar(0.5);
        }
        return lHip || rHip || null;
      }
      case 'spine': {
        // Spine is lower center torso (between hips and chest)
        const hips = this.getJointPosition('hips');
        const chest = this.getJointPosition('chest');
        if (hips && chest) {
          return new THREE.Vector3()
            .addVectors(hips, chest)
            .multiplyScalar(0.5);
        }
        return hips || chest || null;
      }
      case 'chest': {
        const lShoulder = getMPWorldPos(11);
        const rShoulder = getMPWorldPos(12);
        if (lShoulder && rShoulder) {
          return new THREE.Vector3()
            .addVectors(lShoulder, rShoulder)
            .multiplyScalar(0.5);
        }
        return lShoulder || rShoulder || null;
      }
      case 'neck': {
        const chest = this.getJointPosition('chest');
        const nose = getMPWorldPos(0);
        if (chest && nose) {
          return new THREE.Vector3()
            .addVectors(chest, nose)
            .multiplyScalar(0.5);
        }
        return chest || nose || null;
      }
      case 'head': {
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
