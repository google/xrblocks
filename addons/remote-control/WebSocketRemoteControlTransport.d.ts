import { type RemoteControlRequest, type RemoteControlResponse } from './RemoteControlProtocol';
export type WebSocketRemoteControlTransportOptions = {
    url?: string;
    sessionId?: string;
    reconnect?: boolean;
    reconnectDelayMs?: number;
};
export type RemoteControlCommandHandler = (command: RemoteControlRequest) => Promise<RemoteControlResponse>;
export declare class WebSocketRemoteControlTransport {
    private handleRequest;
    private ws?;
    private stopped;
    private reconnectTimer?;
    private readonly url;
    private readonly sessionId;
    private readonly reconnect;
    private readonly reconnectDelayMs;
    private simulatorReady;
    constructor(options: WebSocketRemoteControlTransportOptions, handleRequest: RemoteControlCommandHandler);
    connect(): void;
    disconnect(): void;
    announceSimulatorReady(): void;
    private onOpen;
    private onMessage;
    private handleMessage;
    private onClose;
    private onError;
    private send;
    private sendError;
}
