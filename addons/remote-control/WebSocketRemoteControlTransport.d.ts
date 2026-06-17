import type { EmbodiedControlStepResult } from '../embodied-control';
import { type RemoteControlStepMessage } from './RemoteControlProtocol';
export type WebSocketRemoteControlTransportOptions = {
    url?: string;
    reconnect?: boolean;
    reconnectDelayMs?: number;
};
export type RemoteControlStepHandler = (step: RemoteControlStepMessage) => Promise<EmbodiedControlStepResult>;
export declare class WebSocketRemoteControlTransport {
    private handleStep;
    private ws?;
    private stopped;
    private reconnectTimer?;
    private readonly url;
    private readonly reconnect;
    private readonly reconnectDelayMs;
    constructor(options: WebSocketRemoteControlTransportOptions, handleStep: RemoteControlStepHandler);
    connect(): void;
    disconnect(): void;
    private onOpen;
    private onMessage;
    private handleMessage;
    private onClose;
    private onError;
    private send;
    private sendError;
}
