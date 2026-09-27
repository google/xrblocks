import { EmbodiedControl } from "../../embodied-control/EmbodiedControl.js";
import "../../embodied-control/index.js";
import { REMOTE_CONTROL_BUILT_IN_TOOL_NAMES, RemoteControlBuiltInTool, RemoteControlContextNodeTarget, RemoteControlHandObservation, RemoteControlPoseObservation, RemoteControlTarget, RemoteControlTargetResolver } from "./Types.js";
import { RemoteControlActionToolDependencies, RemoteControlApplyControlToolArgs, RemoteControlClickToolArgs, RemoteControlLookAtTargetToolArgs, RemoteControlPointToToolArgs, RemoteControlReachToToolArgs, RemoteControlTeleportToToolArgs, createRemoteControlActionTools } from "./ActionTools.js";
import { RemoteControlCameraToolArgs, RemoteControlCameraToolResult, RemoteControlHandsToolResult, RemoteControlObservationToolDependencies, RemoteControlScreenshotToolArgs, RemoteControlSimulatorStateToolResult, createRemoteControlObservationTools } from "./ObservationTools.js";
//#region src/addons/remote-control/built-in-tools/index.d.ts
export type RemoteControlBuiltInToolDependencies = RemoteControlObservationToolDependencies & {
  embodiedControl: EmbodiedControl;
} & Pick<RemoteControlActionToolDependencies, 'resolveTarget'>;
export declare function createRemoteControlBuiltInTools(dependencies: RemoteControlBuiltInToolDependencies): RemoteControlBuiltInTool[];
//#endregion
export { REMOTE_CONTROL_BUILT_IN_TOOL_NAMES, RemoteControlActionToolDependencies, RemoteControlApplyControlToolArgs, RemoteControlBuiltInTool, RemoteControlCameraToolArgs, RemoteControlCameraToolResult, RemoteControlClickToolArgs, RemoteControlContextNodeTarget, RemoteControlHandObservation, RemoteControlHandsToolResult, RemoteControlLookAtTargetToolArgs, RemoteControlObservationToolDependencies, RemoteControlPointToToolArgs, RemoteControlPoseObservation, RemoteControlReachToToolArgs, RemoteControlScreenshotToolArgs, RemoteControlSimulatorStateToolResult, RemoteControlTarget, RemoteControlTargetResolver, RemoteControlTeleportToToolArgs, createRemoteControlActionTools, createRemoteControlObservationTools };