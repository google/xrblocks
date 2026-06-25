import * as THREE from 'three';
import { REMOTE_CONTROL_BUILT_IN_TOOL_NAMES } from './Types.js';

function vectorToTuple(vector) {
    return [vector.x, vector.y, vector.z];
}
function quaternionToTuple(quaternion) {
    return [quaternion.x, quaternion.y, quaternion.z, quaternion.w];
}
function poseFromObject(object) {
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
async function getScreenshot(dependencies, args) {
    const { core } = dependencies;
    const screenshotPromise = core.screenshotSynthesizer.getScreenshot(args?.overlayOnCamera ?? false);
    core.stepFrame(0);
    return screenshotPromise;
}
async function getCamera(dependencies, args) {
    const result = poseFromObject(dependencies.camera);
    if (args?.screenshot) {
        result.screenshot = await getScreenshot(dependencies, {
            overlayOnCamera: args.overlayOnCamera,
        });
    }
    return result;
}
function observeHand(dependencies, handIndex) {
    const { simulator, input } = dependencies;
    const controller = handIndex === 0
        ? simulator.hands.leftController
        : simulator.hands.rightController;
    const controllerState = simulator.simulatorControllerState;
    const inputController = input.controllers[handIndex];
    return {
        position: vectorToTuple(controllerState.localControllerPositions[handIndex]),
        quaternion: quaternionToTuple(controllerState.localControllerOrientations[handIndex]),
        selected: !!inputController?.userData.selected,
        squeezing: !!inputController?.userData.squeezing,
        visible: controller?.visible ?? false,
    };
}
function getHands(dependencies) {
    return {
        leftHand: observeHand(dependencies, 0),
        rightHand: observeHand(dependencies, 1),
    };
}
function createRemoteControlObservationTools(dependencies) {
    let frame = 0;
    return [
        {
            name: REMOTE_CONTROL_BUILT_IN_TOOL_NAMES.getCamera,
            handler: async (args) => getCamera(dependencies, args),
            metadata: {
                description: 'Returns the world-space camera pose and optionally a screenshot.',
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
            handler: async (args) => getScreenshot(dependencies, args),
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
                timestampMs: typeof performance !== 'undefined' ? performance.now() : Date.now(),
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

export { createRemoteControlObservationTools };
