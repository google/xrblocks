import { createRemoteControlActionTools } from './ActionTools.js';
import { createRemoteControlObservationTools } from './ObservationTools.js';
export { REMOTE_CONTROL_BUILT_IN_TOOL_NAMES } from './Types.js';
import 'three';

function createRemoteControlBuiltInTools(dependencies) {
    return [
        ...createRemoteControlActionTools(dependencies),
        ...createRemoteControlObservationTools(dependencies),
    ];
}

export { createRemoteControlActionTools, createRemoteControlBuiltInTools, createRemoteControlObservationTools };
