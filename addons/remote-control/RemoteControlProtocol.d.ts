export declare const REMOTE_CONTROL_PROTOCOL_VERSION = 1;
export declare const REMOTE_CONTROL_CLIENT_NAME = "xrblocks-remote-control";
export declare const REMOTE_CONTROL_DEFAULT_SESSION_ID = "default";
export type RemoteControlRole = 'simulator' | 'client';
export type RemoteControlToolMetadata = {
    description?: string;
    parameters?: unknown;
};
export type RemoteControlToolContext = {
    request: RemoteControlCallToolRequest;
};
export type RemoteControlToolHandler = (args: unknown, context: RemoteControlToolContext) => unknown | Promise<unknown>;
export type RemoteControlHelloMessage = {
    type: 'hello';
    role: RemoteControlRole;
    sessionId?: string;
    protocolVersion: number;
    client?: typeof REMOTE_CONTROL_CLIENT_NAME;
    capabilities?: {
        compoundControl?: boolean;
        embodiedControl?: boolean;
        tools?: boolean;
    };
};
export type RemoteControlPingRequest = {
    id: string;
    type: 'ping';
};
export type RemoteControlCallToolRequest = {
    id: string;
    type: 'callTool';
    name: string;
    args?: unknown;
};
export type RemoteControlRequest = RemoteControlPingRequest | RemoteControlCallToolRequest;
export type RemoteControlResponse = {
    type: 'response';
    id: string;
    ok: boolean;
    result?: unknown;
    error?: {
        code: string;
        message: string;
    };
};
export type RemoteControlSimulatorReadyMessage = {
    type: 'simulatorReady';
};
export type RemoteControlIncomingMessage = RemoteControlHelloMessage | RemoteControlRequest | RemoteControlResponse | RemoteControlSimulatorReadyMessage;
export type RemoteControlOutgoingMessage = RemoteControlHelloMessage | RemoteControlResponse | RemoteControlSimulatorReadyMessage;
export declare function createHello(role?: RemoteControlRole, sessionId?: string): RemoteControlHelloMessage;
export declare function isRemoteControlRequest(value: unknown): value is RemoteControlRequest;
export declare function isRemoteControlResponse(value: unknown): value is RemoteControlResponse;
export declare function parseRemoteControlMessage(data: MessageEvent['data']): unknown;
