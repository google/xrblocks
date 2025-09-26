import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';

import {HAND_JOINT_NAMES} from '../input/components/HandJointNames';
import {Input} from '../input/Input';
import type {DeepReadonly} from '../utils/Types';

import {SimulatorHandPoseChangeRequestEvent} from './events/SimulatorHandEvents';
import {SimulatorHandPoseJoints} from './handPoses/HandPoseJoints';
import {SIMULATOR_HAND_POSE_TO_JOINTS_LEFT, SIMULATOR_HAND_POSE_TO_JOINTS_RIGHT, SimulatorHandPose} from './handPoses/HandPoses';
import {SimulatorControllerState} from './SimulatorControllerState';
import {SimulatorXRHand} from './SimulatorXRHand';

const DEFAULT_HAND_PROFILE_PATH =
    'https://cdn.jsdelivr.net/npm/@webxr-input-profiles/assets@1.0/dist/profiles/generic-hand/';

const vector3 = new THREE.Vector3();
const quaternion = new THREE.Quaternion();

export type SimulatorHandPoseHTMLElement = HTMLElement&{
  visible: boolean;
  handPose?: SimulatorHandPose;
}

export class SimulatorHands {
  leftController = new THREE.Object3D();
  rightController = new THREE.Object3D();
  leftHand?: THREE.Group;
  rightHand?: THREE.Group;
  leftHandBones: THREE.Object3D[] = [];
  rightHandBones: THREE.Object3D[] = [];
  leftHandPose? = SimulatorHandPose.RELAXED;
  rightHandPose? = SimulatorHandPose.RELAXED;
  leftHandTargetJoints: DeepReadonly<SimulatorHandPoseJoints> =
      SIMULATOR_HAND_POSE_TO_JOINTS_LEFT[SimulatorHandPose.RELAXED];
  rightHandTargetJoints: DeepReadonly<SimulatorHandPoseJoints> =
      SIMULATOR_HAND_POSE_TO_JOINTS_RIGHT[SimulatorHandPose.RELAXED];
  lerpSpeed = 0.1;
  handPosePanelElement?: SimulatorHandPoseHTMLElement;
  onHandPoseChangeRequestBound = this.onHandPoseChangeRequest.bind(this);
  input!: Input;
  loader!: GLTFLoader;

  private leftXRHand = new SimulatorXRHand();
  private rightXRHand = new SimulatorXRHand();

  constructor(
      private simulatorControllerState: SimulatorControllerState,
      private simulatorScene: THREE.Scene) {}

  /**
   * Initialize Simulator Hands.
   */
  init({input}: {input: Input}) {
    this.input = input;
    this.loadMeshes();
    this.simulatorScene.add(this.leftController);
    this.simulatorScene.add(this.rightController);
  }

  loadMeshes() {
    this.loader = new GLTFLoader();
    this.loader.setPath(DEFAULT_HAND_PROFILE_PATH);
    this.loader.load('left.glb', gltf => {
      this.leftHand = gltf.scene;
      this.leftController.add(this.leftHand);
      HAND_JOINT_NAMES.forEach(jointName => {
        const bone = gltf.scene.getObjectByName(jointName);
        if (bone) {
          this.leftHandBones.push(bone);
        } else {
          console.warn(`Couldn't find ${jointName} in left hand mesh`);
        }
      });
      this.setLeftHandJoints(this.leftHandTargetJoints);
      this.input.hands[0]?.dispatchEvent?.({
        type: 'connected',
        data: {hand: this.leftXRHand, handedness: 'left'} as XRInputSource
      });
    });
    this.loader.load('right.glb', gltf => {
      this.rightHand = gltf.scene;
      this.rightController.add(this.rightHand);
      HAND_JOINT_NAMES.forEach(jointName => {
        const bone = gltf.scene.getObjectByName(jointName);
        if (bone) {
          this.rightHandBones.push(bone);
        } else {
          console.warn(`Couldn't find ${jointName} in right hand mesh`);
        }
      });
      this.setRightHandJoints(this.rightHandTargetJoints);
      this.input.hands[1]?.dispatchEvent?.({
        type: 'connected',
        data: {hand: this.rightXRHand, handedness: 'right'} as XRInputSource
      });
    });
  }

  setLeftHandLerpPose(pose: SimulatorHandPose) {
    if (this.leftHandPose === pose) return;

    if (pose === SimulatorHandPose.PINCHING) {
      this.input.dispatchEvent({
        type: 'selectstart',
        target: this.input.controllers[0],
        data: {
          handedness: 'left',
        }
      });
    } else if (this.leftHandPose === SimulatorHandPose.PINCHING) {
      this.input.dispatchEvent({
        type: 'selectend',
        target: this.input.controllers[0],
        data: {
          handedness: 'left',
        }
      });
    }

    this.leftHandPose = pose;
    this.leftHandTargetJoints = SIMULATOR_HAND_POSE_TO_JOINTS_LEFT[pose];
    this.updateHandPosePanel();
  }

  setRightHandLerpPose(pose: SimulatorHandPose) {
    if (this.rightHandPose === pose) return;

    if (pose === SimulatorHandPose.PINCHING) {
      this.input.dispatchEvent({
        type: 'selectstart',
        target: this.input.controllers[1],
        data: {
          handedness: 'right',
        }
      });
    } else if (this.rightHandPose === SimulatorHandPose.PINCHING) {
      this.input.dispatchEvent({
        type: 'selectend',
        target: this.input.controllers[1],
        data: {
          handedness: 'right',
        }
      });
    }

    this.rightHandPose = pose;
    this.rightHandTargetJoints = SIMULATOR_HAND_POSE_TO_JOINTS_RIGHT[pose];
    this.updateHandPosePanel();
  }

  setLeftHandJoints(joints: DeepReadonly<SimulatorHandPoseJoints>) {
    // Unset the pose if the joints are manually defined.
    if (this.leftHandPose === SimulatorHandPose.PINCHING) {
      this.input.dispatchEvent({
        type: 'selectend',
        target: this.input.controllers[1],
        data: {
          handedness: 'left',
        }
      });
    }
    if (joints != this.leftHandTargetJoints) {
      this.leftHandPose = undefined;
      this.leftHandTargetJoints = joints;
    }
    for (let i = 0; i < this.leftHandBones.length; i++) {
      const bone = this.leftHandBones[i];
      const jointData = joints[i];
      if (bone && jointData) {
        bone.position.fromArray(jointData.t)
        bone.quaternion.fromArray(jointData.r);
        bone.scale.fromArray([1, 1, 1]);
      }
    }
  }

  setRightHandJoints(joints: DeepReadonly<SimulatorHandPoseJoints>) {
    // Unset the pose if the joints are manually defined.
    if (this.rightHandPose === SimulatorHandPose.PINCHING) {
      this.input.dispatchEvent({
        type: 'selectend',
        target: this.input.controllers[1],
        data: {
          handedness: 'right',
        }
      });
    }
    if (joints != this.rightHandTargetJoints) {
      this.rightHandPose = undefined;
      this.rightHandTargetJoints = joints;
    }
    for (let i = 0; i < this.rightHandBones.length; i++) {
      const bone = this.rightHandBones[i];
      const jointData = joints[i];
      if (bone && jointData) {
        bone.position.fromArray(jointData.t)
        bone.quaternion.fromArray(jointData.r);
        bone.scale.fromArray([1, 1, 1]);
      }
    }
  }

  update() {
    this.lerpLeftHandPose();
    this.lerpRightHandPose();
    this.syncHandJoints();
  }

  lerpLeftHandPose() {
    for (let i = 0; i < this.leftHandBones.length; i++) {
      const bone = this.leftHandBones[i];
      const targetJoint = this.leftHandTargetJoints[i];
      if (bone && targetJoint) {
        vector3.fromArray(targetJoint.t)
        quaternion.fromArray(targetJoint.r);

        bone.position.lerp(vector3, this.lerpSpeed);
        bone.quaternion.slerp(quaternion, this.lerpSpeed);
      }
    }
  }

  lerpRightHandPose() {
    for (let i = 0; i < this.rightHandBones.length; i++) {
      const bone = this.rightHandBones[i];
      const targetJoint = this.rightHandTargetJoints[i];
      if (bone && targetJoint) {
        vector3.fromArray(targetJoint.t)
        quaternion.fromArray(targetJoint.r);

        bone.position.lerp(vector3, this.lerpSpeed);
        bone.quaternion.slerp(quaternion, this.lerpSpeed);
      }
    }
  }

  syncHandJoints() {
    const hands = this.input.hands;
    const leftHand = hands[0];
    if (leftHand) {
      this.leftController.updateWorldMatrix(true, false);
      leftHand.position.setFromMatrixPosition(this.leftController.matrixWorld);
      leftHand.setRotationFromMatrix(this.leftController.matrixWorld);
      leftHand.updateMatrix();
      for (let i = 0; i < this.leftHandBones.length; i++) {
        const joint = HAND_JOINT_NAMES[i];
        if (!(joint in leftHand.joints)) {
          leftHand.joints[joint] = new THREE.Group() as THREE.XRJointSpace;
          leftHand.add(leftHand.joints[joint]);
        }
        leftHand.joints[joint]!.position.copy(this.leftHandBones[i].position);
        leftHand.joints[joint]!.quaternion.copy(
            this.leftHandBones[i].quaternion);
        leftHand.updateWorldMatrix(false, true);
      }
    }
    const rightHand = hands[1];
    if (rightHand) {
      this.rightController.updateWorldMatrix(true, false);
      rightHand.position.setFromMatrixPosition(
          this.rightController.matrixWorld);
      rightHand.setRotationFromMatrix(this.rightController.matrixWorld);
      rightHand.updateMatrix();
      for (let i = 0; i < this.rightHandBones.length; i++) {
        const joint = HAND_JOINT_NAMES[i];
        if (!(joint in rightHand.joints)) {
          rightHand.joints[joint] = new THREE.Group() as THREE.XRJointSpace;
          rightHand.add(rightHand.joints[joint]);
        }
        rightHand.joints[joint]!.position.copy(this.rightHandBones[i].position);
        rightHand.joints[joint]!.quaternion.copy(
            this.rightHandBones[i].quaternion);
        rightHand.updateWorldMatrix(false, true);
      }
    }
  }

  setLeftHandPinching(pinching = true) {
    this.setLeftHandLerpPose(
        pinching ? SimulatorHandPose.PINCHING : SimulatorHandPose.RELAXED);
  }

  setRightHandPinching(pinching = true) {
    this.setRightHandLerpPose(
        pinching ? SimulatorHandPose.PINCHING : SimulatorHandPose.RELAXED);
  }

  showHands() {
    this.leftController.visible = true;
    this.rightController.visible = true;
    for (let i = 0; i < this.input.hands.length; i++) {
      this.input.hands[i].visible = true;
    }
    this.updateHandPosePanel();
  }

  hideHands() {
    this.leftController.visible = false;
    this.rightController.visible = false;
    for (let i = 0; i < this.input.hands.length; i++) {
      this.input.hands[i].visible = false;
    }
    this.updateHandPosePanel();
  }

  updateHandPosePanel() {
    if (!this.handPosePanelElement) return;
    if (this.simulatorControllerState.currentControllerIndex === 0) {
      this.handPosePanelElement.visible = this.leftController.visible;
      this.handPosePanelElement.handPose = this.leftHandPose;
    } else {
      this.handPosePanelElement.visible = this.rightController.visible;
      this.handPosePanelElement.handPose = this.rightHandPose;
    }
  }

  setHandPosePanelElement(element: HTMLElement) {
    if (this.handPosePanelElement) {
      this.handPosePanelElement.removeEventListener(
          SimulatorHandPoseChangeRequestEvent.type,
          this.onHandPoseChangeRequestBound);
    }
    element.addEventListener(
        SimulatorHandPoseChangeRequestEvent.type,
        this.onHandPoseChangeRequestBound);
    this.handPosePanelElement = element as SimulatorHandPoseHTMLElement;
    this.updateHandPosePanel();
  }

  onHandPoseChangeRequest(event: Event) {
    if (event.type != SimulatorHandPoseChangeRequestEvent.type) return;
    const handPoseChangeEvent = event as SimulatorHandPoseChangeRequestEvent;
    if (this.simulatorControllerState.currentControllerIndex === 0) {
      this.setLeftHandLerpPose(handPoseChangeEvent.pose);
    } else {
      this.setRightHandLerpPose(handPoseChangeEvent.pose);
    }
  }

  toggleHandedness() {
    this.simulatorControllerState.currentControllerIndex =
        (this.simulatorControllerState.currentControllerIndex + 1) % 2;
    this.updateHandPosePanel();
  }
}
