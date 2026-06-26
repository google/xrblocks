import * as THREE from 'three';
import type {Core, Input, Simulator} from 'xrblocks';

import {
  REMOTE_CONTROL_BUILT_IN_TOOL_NAMES,
  type RemoteControlBuiltInTool,
  type RemoteControlHandObservation,
  type RemoteControlPoseObservation,
} from './Types';

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

function vectorToTuple(vector: THREE.Vector3): [number, number, number] {
  return [vector.x, vector.y, vector.z];
}

function quaternionToTuple(
  quaternion: THREE.Quaternion
): [number, number, number, number] {
  return [quaternion.x, quaternion.y, quaternion.z, quaternion.w];
}

function poseFromObject(object: THREE.Object3D): RemoteControlPoseObservation {
  object.updateMatrixWorld(true);
  const position = new THREE.Vector3();
  const quaternion = new THREE.Quaternion();
  object.getWorldPosition(position);
  object.getWorldQuaternion(quaternion);
  return {
    position: vectorToTuple(position),
    quaternion: quaternionToTuple(quaternion),
  };
}

async function getScreenshot(
  dependencies: RemoteControlObservationToolDependencies,
  args?: RemoteControlScreenshotToolArgs
) {
  const {core} = dependencies;
  const screenshotPromise = core.screenshotSynthesizer.getScreenshot(
    args?.overlayOnCamera ?? false
  );
  core.stepFrame(0);
  return screenshotPromise;
}

async function getCamera(
  dependencies: RemoteControlObservationToolDependencies,
  args?: RemoteControlCameraToolArgs
): Promise<RemoteControlCameraToolResult> {
  const result: RemoteControlCameraToolResult = poseFromObject(
    dependencies.camera
  );
  if (args?.screenshot) {
    result.screenshot = await getScreenshot(dependencies, {
      overlayOnCamera: args.overlayOnCamera,
    });
  }
  return result;
}

function observeHand(
  dependencies: RemoteControlObservationToolDependencies,
  handIndex: number
): RemoteControlHandObservation {
  const {simulator, input} = dependencies;
  const controller =
    handIndex === 0
      ? simulator.hands.leftController
      : simulator.hands.rightController;
  const controllerState = simulator.simulatorControllerState;
  const inputController = input.controllers[handIndex];
  return {
    position: vectorToTuple(
      controllerState.localControllerPositions[handIndex]
    ),
    quaternion: quaternionToTuple(
      controllerState.localControllerOrientations[handIndex]
    ),
    selected: !!inputController?.userData.selected,
    squeezing: !!inputController?.userData.squeezing,
    visible: controller?.visible ?? false,
  };
}

function getHands(
  dependencies: RemoteControlObservationToolDependencies
): RemoteControlHandsToolResult {
  return {
    leftHand: observeHand(dependencies, 0),
    rightHand: observeHand(dependencies, 1),
  };
}

export function createRemoteControlObservationTools(
  dependencies: RemoteControlObservationToolDependencies
): RemoteControlBuiltInTool[] {
  let frame = 0;
  return [
    {
      name: REMOTE_CONTROL_BUILT_IN_TOOL_NAMES.getCamera,
      handler: async (args) =>
        getCamera(dependencies, args as RemoteControlCameraToolArgs),
      metadata: {
        description:
          'Returns the world-space camera pose and optionally a screenshot.',
        parameters: {
          screenshot: 'boolean',
          overlayOnCamera: 'boolean',
        },
      },
    },
    {
      name: REMOTE_CONTROL_BUILT_IN_TOOL_NAMES.getHands,
      handler: async () => getHands(dependencies),
      metadata: {
        description: 'Returns simulator left and right hand/controller state.',
      },
    },
    {
      name: REMOTE_CONTROL_BUILT_IN_TOOL_NAMES.getScreenshot,
      handler: async (args) =>
        getScreenshot(dependencies, args as RemoteControlScreenshotToolArgs),
      metadata: {
        description: 'Returns a screenshot data URL.',
        parameters: {
          overlayOnCamera: 'boolean',
        },
      },
    },
    {
      name: REMOTE_CONTROL_BUILT_IN_TOOL_NAMES.getSimulatorState,
      handler: async () => ({
        timestampMs:
          typeof performance !== 'undefined' ? performance.now() : Date.now(),
        frame: frame++,
        simulatorRunning: dependencies.core.simulatorRunning,
        paused: dependencies.core.isPaused,
      }),
      metadata: {
        description: 'Returns remote-control frame and simulator state.',
      },
    },
  ];
}
