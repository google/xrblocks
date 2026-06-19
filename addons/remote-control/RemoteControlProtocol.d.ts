import type { EmbodiedControlStep, EmbodiedControlStepResult, XRCompoundControl } from '../embodied-control';
export declare const REMOTE_CONTROL_PROTOCOL_VERSION = 1;
export type RemoteControlHandshakeMessage = {
    type: 'HANDSHAKE';
    client: 'xrblocks-remote-control';
    version: number;
    capabilities: {
        compoundControl: true;
        embodiedControl: true;
    };
};
export type RemoteControlStepMessage = EmbodiedControlStep & {
    type: 'STEP';
    control: XRCompoundControl;
};
export type RemoteControlTeleportMessage = {
    id?: string;
    type: 'TELEPORT_TO';
    target: [number, number, number] | string;
    options?: {
        distance?: number;
        faceTarget?: boolean;
        snapToGround?: boolean;
    };
};
export type RemoteControlLookAtMessage = {
    id?: string;
    type: 'LOOK_AT_TARGET';
    target: [number, number, number] | string;
    options?: {
        velocity?: number;
    };
};
export type RemoteControlPointToMessage = {
    id?: string;
    type: 'POINT_TO';
    handIndex: number;
    target: [number, number, number] | string;
    options?: {
        velocity?: number;
    };
};
export type RemoteControlReachToMessage = {
    id?: string;
    type: 'REACH_TO';
    handIndex: number;
    target: [number, number, number] | string;
    options?: {
        velocity?: number;
    };
};
export type RemoteControlClickMessage = {
    id?: string;
    type: 'CLICK';
    handIndex: number;
    options?: {
        durationMs?: number;
    };
};
export type RemoteControlMessage = RemoteControlStepMessage | RemoteControlTeleportMessage | RemoteControlLookAtMessage | RemoteControlPointToMessage | RemoteControlReachToMessage | RemoteControlClickMessage;
export type RemoteControlStepCompletedMessage = EmbodiedControlStepResult & {
    type: 'STEP_COMPLETED';
};
export type RemoteControlActionRejectedMessage = {
    type: 'ACTION_REJECTED';
    id?: string;
    reason: 'active_step';
};
export type RemoteControlErrorMessage = {
    type: 'ERROR';
    id?: string;
    message: string;
};
export type RemoteControlOutgoingMessage = RemoteControlHandshakeMessage | RemoteControlStepCompletedMessage | RemoteControlActionRejectedMessage | RemoteControlErrorMessage;
export declare function createHandshake(): RemoteControlHandshakeMessage;
export declare function isCommandMessage(value: unknown): value is RemoteControlMessage;
export declare function parseRemoteControlMessage(data: MessageEvent['data']): unknown;
