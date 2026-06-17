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
export declare function isStepMessage(value: unknown): value is RemoteControlStepMessage;
export declare function parseRemoteControlMessage(data: MessageEvent['data']): unknown;
