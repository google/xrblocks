import * as THREE from 'three';
import type { Core, Input, Simulator } from 'xrblocks';
import { type RemoteControlBuiltInTool, type RemoteControlHandObservation, type RemoteControlPoseObservation } from './Types';
export type RemoteControlObservationToolDependencies = {
    core: Core;
    simulator: Simulator;
    input: Input;
    camera: THREE.Camera;
};
export type RemoteControlCameraToolArgs = {
    screenshot?: boolean;
    overlayOnCamera?: boolean;
};
export type RemoteControlScreenshotToolArgs = {
    overlayOnCamera?: boolean;
};
export type RemoteControlCameraToolResult = RemoteControlPoseObservation & {
    screenshot?: string;
};
export type RemoteControlHandsToolResult = {
    leftHand: RemoteControlHandObservation;
    rightHand: RemoteControlHandObservation;
};
export type RemoteControlSimulatorStateToolResult = {
    timestampMs: number;
    frame: number;
    simulatorRunning: boolean;
    paused: boolean;
};
export declare function createRemoteControlObservationTools(dependencies: RemoteControlObservationToolDependencies): RemoteControlBuiltInTool[];
