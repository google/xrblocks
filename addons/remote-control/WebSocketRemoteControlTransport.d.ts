import type { EmbodiedControlStepResult } from '../embodied-control';
import { type RemoteControlMessage } from './RemoteControlProtocol';
export type WebSocketRemoteControlTransportOptions = {
    url?: string;
    reconnect?: boolean;
    reconnectDelayMs?: number;
};
export type RemoteControlCommandHandler = (command: RemoteControlMessage) => Promise<EmbodiedControlStepResult>;
export declare class WebSocketRemoteControlTransport {
    private handleCommand;
    private ws?;
    private stopped;
    private reconnectTimer?;
    private readonly url;
    private readonly reconnect;
    private readonly reconnectDelayMs;
    constructor(options: WebSocketRemoteControlTransportOptions, handleCommand: RemoteControlCommandHandler);
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
