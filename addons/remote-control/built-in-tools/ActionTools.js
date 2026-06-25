import { REMOTE_CONTROL_BUILT_IN_TOOL_NAMES } from './Types.js';

function createRemoteControlActionTools({ embodiedControl, resolveTarget, }) {
    return [
        {
            name: REMOTE_CONTROL_BUILT_IN_TOOL_NAMES.step,
            handler: async (args) => {
                await embodiedControl.step(args);
                return { completed: true };
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
                embodiedControl.applyControl(args.control);
                return { completed: true };
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
                const { target, options } = args;
                await embodiedControl.teleportTo(resolveTarget(target), options);
                return { completed: true };
            },
            metadata: {
                description: 'Teleports the simulator camera to a scene target.',
                parameters: {
                    target: 'Vec3 tuple or scene object name',
                    options: 'teleport options',
                },
            },
        },
        {
            name: REMOTE_CONTROL_BUILT_IN_TOOL_NAMES.lookAtTarget,
            handler: async (args) => {
                const { target, options } = args;
                await embodiedControl.lookAtTarget(resolveTarget(target), options);
                return { completed: true };
            },
            metadata: {
                description: 'Rotates the simulator camera to face a scene target.',
                parameters: {
                    target: 'Vec3 tuple or scene object name',
                    options: 'look options',
                },
            },
        },
        {
            name: REMOTE_CONTROL_BUILT_IN_TOOL_NAMES.pointTo,
            handler: async (args) => {
                const { handIndex, target, options } = args;
                await embodiedControl.pointTo(handIndex, resolveTarget(target), options);
                return { completed: true };
            },
            metadata: {
                description: 'Moves a simulator hand to point at a scene target.',
                parameters: {
                    handIndex: 'number',
                    target: 'Vec3 tuple or scene object name',
                    options: 'hand motion options',
                },
            },
        },
        {
            name: REMOTE_CONTROL_BUILT_IN_TOOL_NAMES.reachTo,
            handler: async (args) => {
                const { handIndex, target, options } = args;
                await embodiedControl.reachTo(handIndex, resolveTarget(target), options);
                return { completed: true };
            },
            metadata: {
                description: 'Moves a simulator hand to reach toward a scene target.',
                parameters: {
                    handIndex: 'number',
                    target: 'Vec3 tuple or scene object name',
                    options: 'hand motion options',
                },
            },
        },
        {
            name: REMOTE_CONTROL_BUILT_IN_TOOL_NAMES.click,
            handler: async (args) => {
                const { handIndex, options } = (args ?? {});
                await embodiedControl.click(handIndex, options);
                return { completed: true };
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

export { createRemoteControlActionTools };
