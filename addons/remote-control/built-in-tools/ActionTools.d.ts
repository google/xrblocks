import type { EmbodiedControl, XRCompoundControl } from '../../embodied-control';
import { type RemoteControlBuiltInTool, type RemoteControlTarget, type RemoteControlTargetResolver } from './Types';
export type RemoteControlApplyControlToolArgs = {
    control: XRCompoundControl;
};
export type RemoteControlTeleportToToolArgs = {
    target: RemoteControlTarget;
    options?: {
        distance?: number;
        faceTarget?: boolean;
        snapToGround?: boolean;
    };
};
export type RemoteControlLookAtTargetToolArgs = {
    target: RemoteControlTarget;
    options?: {
        velocity?: number;
    };
};
export type RemoteControlPointToToolArgs = {
    handIndex: number;
    target: RemoteControlTarget;
    options?: {
        velocity?: number;
    };
};
export type RemoteControlReachToToolArgs = RemoteControlPointToToolArgs;
export type RemoteControlClickToolArgs = {
    handIndex?: number;
    options?: {
        durationMs?: number;
    };
};
export type RemoteControlActionToolDependencies = {
    embodiedControl: EmbodiedControl;
    resolveTarget: RemoteControlTargetResolver;
};
export declare function createRemoteControlActionTools({ embodiedControl, resolveTarget, }: RemoteControlActionToolDependencies): RemoteControlBuiltInTool[];
