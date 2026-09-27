import { RemoteControlBuiltInTool, RemoteControlHandObservation, RemoteControlPoseObservation } from "./Types.js";
import * as THREE from "three";
import { Core, Input, Simulator } from "xrblocks";
//#region src/addons/remote-control/built-in-tools/ObservationTools.d.ts
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
//#endregion