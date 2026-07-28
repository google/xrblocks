import type {
  EmbodiedControl,
  EmbodiedControlStep,
  XRCompoundControl,
} from '../../embodied-control';
import {
  REMOTE_CONTROL_BUILT_IN_TOOL_NAMES,
  type RemoteControlBuiltInTool,
  type RemoteControlTarget,
  type RemoteControlTargetResolver,
} from './Types';

export type RemoteControlApplyControlToolArgs = {
  control: XRCompoundControl;
};

export type RemoteControlTeleportToToolArgs = {
  target: RemoteControlTarget;
  options?: {distance?: number; faceTarget?: boolean; snapToGround?: boolean};
};

export type RemoteControlLookAtTargetToolArgs = {
  target: RemoteControlTarget;
  options?: {velocity?: number};
};

export type RemoteControlPointToToolArgs = {
  handIndex: number;
  target: RemoteControlTarget;
  options?: {velocity?: number};
};

export type RemoteControlReachToToolArgs = RemoteControlPointToToolArgs;

export type RemoteControlClickToolArgs = {
  handIndex?: number;
  options?: {durationMs?: number};
};

export type RemoteControlActionToolDependencies = {
  embodiedControl: EmbodiedControl;
  resolveTarget: RemoteControlTargetResolver;
};

export function createRemoteControlActionTools({
  embodiedControl,
  resolveTarget,
}: RemoteControlActionToolDependencies): RemoteControlBuiltInTool[] {
  return [
    {
      name: REMOTE_CONTROL_BUILT_IN_TOOL_NAMES.step,
      handler: async (args) => {
        await embodiedControl.step(args as EmbodiedControlStep);
        return {completed: true};
      },
      metadata: {
        description: 'Runs an embodied-control step.',
        parameters: {
          durationMs: 'number',
          control: 'XRCompoundControl',
        },
      },
    },
    {
      name: REMOTE_CONTROL_BUILT_IN_TOOL_NAMES.applyControl,
      handler: async (args) => {
        embodiedControl.applyControl(
          (args as RemoteControlApplyControlToolArgs).control
        );
        return {completed: true};
      },
      metadata: {
        description: 'Applies an immediate embodied compound control.',
        parameters: {
          control: 'XRCompoundControl',
        },
      },
    },
    {
      name: REMOTE_CONTROL_BUILT_IN_TOOL_NAMES.teleportTo,
      handler: async (args) => {
        const {target, options} = args as RemoteControlTeleportToToolArgs;
        await embodiedControl.teleportTo(resolveTarget(target), options);
        return {completed: true};
      },
      metadata: {
        description: 'Teleports the simulator camera to a scene target.',
        parameters: {
          target:
            'Vec3 tuple, scene object name, or {type: "contextNode", id: string}',
          options: 'teleport options',
        },
      },
    },
    {
      name: REMOTE_CONTROL_BUILT_IN_TOOL_NAMES.lookAtTarget,
      handler: async (args) => {
        const {target, options} = args as RemoteControlLookAtTargetToolArgs;
        await embodiedControl.lookAtTarget(resolveTarget(target), options);
        return {completed: true};
      },
      metadata: {
        description: 'Rotates the simulator camera to face a scene target.',
        parameters: {
          target:
            'Vec3 tuple, scene object name, or {type: "contextNode", id: string}',
          options: 'look options',
        },
      },
    },
    {
      name: REMOTE_CONTROL_BUILT_IN_TOOL_NAMES.pointTo,
      handler: async (args) => {
        const {handIndex, target, options} =
          args as RemoteControlPointToToolArgs;
        await embodiedControl.pointTo(
          handIndex,
          resolveTarget(target),
          options
        );
        return {completed: true};
      },
      metadata: {
        description: 'Moves a simulator hand to point at a scene target.',
        parameters: {
          handIndex: 'number',
          target:
            'Vec3 tuple, scene object name, or {type: "contextNode", id: string}',
          options: 'hand motion options',
        },
      },
    },
    {
      name: REMOTE_CONTROL_BUILT_IN_TOOL_NAMES.reachTo,
      handler: async (args) => {
        const {handIndex, target, options} =
          args as RemoteControlReachToToolArgs;
        await embodiedControl.reachTo(
          handIndex,
          resolveTarget(target),
          options
        );
        return {completed: true};
      },
      metadata: {
        description: 'Moves a simulator hand to reach toward a scene target.',
        parameters: {
          handIndex: 'number',
          target:
            'Vec3 tuple, scene object name, or {type: "contextNode", id: string}',
          options: 'hand motion options',
        },
      },
    },
    {
      name: REMOTE_CONTROL_BUILT_IN_TOOL_NAMES.click,
      handler: async (args) => {
        const {handIndex, options} = (args ?? {}) as RemoteControlClickToolArgs;
        await embodiedControl.click(handIndex, options);
        return {completed: true};
      },
      metadata: {
        description: 'Runs a simulator select/click gesture.',
        parameters: {
          handIndex: 'number',
          options: 'click options',
        },
      },
    },
  ];
}
