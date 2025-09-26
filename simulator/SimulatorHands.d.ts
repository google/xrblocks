import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { Input } from '../input/Input';
import type { DeepReadonly } from '../utils/Types';
import { SimulatorHandPoseJoints } from './handPoses/HandPoseJoints';
import { SimulatorHandPose } from './handPoses/HandPoses';
import { SimulatorControllerState } from './SimulatorControllerState';
export type SimulatorHandPoseHTMLElement = HTMLElement & {
    visible: boolean;
    handPose?: SimulatorHandPose;
};
export declare class SimulatorHands {
    private simulatorControllerState;
    private simulatorScene;
    leftController: THREE.Object3D<THREE.Object3DEventMap>;
    rightController: THREE.Object3D<THREE.Object3DEventMap>;
    leftHand?: THREE.Group;
    rightHand?: THREE.Group;
    leftHandBones: THREE.Object3D[];
    rightHandBones: THREE.Object3D[];
    leftHandPose?: SimulatorHandPose | undefined;
    rightHandPose?: SimulatorHandPose | undefined;
    leftHandTargetJoints: DeepReadonly<SimulatorHandPoseJoints>;
    rightHandTargetJoints: DeepReadonly<SimulatorHandPoseJoints>;
    lerpSpeed: number;
    handPosePanelElement?: SimulatorHandPoseHTMLElement;
    onHandPoseChangeRequestBound: (event: Event) => void;
    input: Input;
    loader: GLTFLoader;
    private leftXRHand;
    private rightXRHand;
    constructor(simulatorControllerState: SimulatorControllerState, simulatorScene: THREE.Scene);
    /**
     * Initialize Simulator Hands.
     */
    init({ input }: {
        input: Input;
    }): void;
    loadMeshes(): void;
    setLeftHandLerpPose(pose: SimulatorHandPose): void;
    setRightHandLerpPose(pose: SimulatorHandPose): void;
    setLeftHandJoints(joints: DeepReadonly<SimulatorHandPoseJoints>): void;
    setRightHandJoints(joints: DeepReadonly<SimulatorHandPoseJoints>): void;
    update(): void;
    lerpLeftHandPose(): void;
    lerpRightHandPose(): void;
    syncHandJoints(): void;
    setLeftHandPinching(pinching?: boolean): void;
    setRightHandPinching(pinching?: boolean): void;
    showHands(): void;
    hideHands(): void;
    updateHandPosePanel(): void;
    setHandPosePanelElement(element: HTMLElement): void;
    onHandPoseChangeRequest(event: Event): void;
    toggleHandedness(): void;
}
