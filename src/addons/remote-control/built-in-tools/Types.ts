import type * as THREE from 'three';

import type {
  RemoteControlToolHandler,
  RemoteControlToolMetadata,
} from '../RemoteControlProtocol';

export const REMOTE_CONTROL_BUILT_IN_TOOL_NAMES = {
  step: 'step',
  applyControl: 'applyControl',
  teleportTo: 'teleportTo',
  lookAtTarget: 'lookAtTarget',
  pointTo: 'pointTo',
  reachTo: 'reachTo',
  click: 'click',
  getCamera: 'getCamera',
  getHands: 'getHands',
  getScreenshot: 'getScreenshot',
  getSimulatorState: 'getSimulatorState',
} as const;

export type RemoteControlBuiltInTool = {
  name: string;
  handler: RemoteControlToolHandler;
  metadata: RemoteControlToolMetadata;
};

export type RemoteControlContextNodeTarget = {
  type: 'contextNode';
  id: string;
};

export type RemoteControlTarget =
  | [number, number, number]
  | string
  | RemoteControlContextNodeTarget;

export type RemoteControlTargetResolver = (
  target: RemoteControlTarget
) => THREE.Vector3 | THREE.Object3D;

export type RemoteControlPoseObservation = {
  position: [number, number, number];
  quaternion: [number, number, number, number];
};

export type RemoteControlHandObservation = RemoteControlPoseObservation & {
  selected: boolean;
  squeezing: boolean;
  visible: boolean;
};
