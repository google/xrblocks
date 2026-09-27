import { REMOTE_CONTROL_BUILT_IN_TOOL_NAMES } from "./Types.js";
import { createRemoteControlActionTools } from "./ActionTools.js";
import { createRemoteControlObservationTools } from "./ObservationTools.js";
//#region src/addons/remote-control/built-in-tools/index.ts
function createRemoteControlBuiltInTools(dependencies) {
	return [...createRemoteControlActionTools(dependencies), ...createRemoteControlObservationTools(dependencies)];
}
//#endregion
export { REMOTE_CONTROL_BUILT_IN_TOOL_NAMES, createRemoteControlActionTools, createRemoteControlBuiltInTools, createRemoteControlObservationTools };
