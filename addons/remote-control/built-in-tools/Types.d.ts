import { RemoteControlToolHandler, RemoteControlToolMetadata } from "../RemoteControlProtocol.js";
import * as THREE from "three";
//#region src/addons/remote-control/built-in-tools/Types.d.ts
export declare const REMOTE_CONTROL_BUILT_IN_TOOL_NAMES: {
  readonly step: 'step';
  readonly applyControl: 'applyControl';
  readonly teleportTo: 'teleportTo';
  readonly lookAtTarget: 'lookAtTarget';
  readonly pointTo: 'pointTo';
  readonly reachTo: 'reachTo';
  readonly click: 'click';
  readonly getCamera: 'getCamera';
  readonly getHands: 'getHands';
  readonly getScreenshot: 'getScreenshot';
  readonly getSimulatorState: 'getSimulatorState';
};
export type RemoteControlBuiltInTool = {
  name: string;
  handler: RemoteControlToolHandler;
  metadata: RemoteControlToolMetadata;
};
export type RemoteControlContextNodeTarget = {
  type: 'contextNode';
  id: string;
};
export type RemoteControlTarget = [number, number, number] | string | RemoteControlContextNodeTarget;
export type RemoteControlTargetResolver = (target: RemoteControlTarget) => THREE.Vector3 | THREE.Object3D;
export type RemoteControlPoseObservation = {
  position: [number, number, number];
  quaternion: [number, number, number, number];
};
export type RemoteControlHandObservation = RemoteControlPoseObservation & {
  selected: boolean;
  squeezing: boolean;
  visible: boolean;
};
//#endregion