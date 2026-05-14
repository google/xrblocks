import { Transport, TransportConnectOptions, TransportPayload } from './Transport';
export interface WebSocketTransportOptions {
    /** Full ws:// or wss:// URL of the relay server. */
    url: string;
    /** Optional reconnect attempts (default: 5). Set to 0 to disable. */
    reconnectAttempts?: number;
}
export declare class WebSocketTransport extends Transport {
    readonly name = "WebSocket";
    private _ws?;
    private _localPeerId;
    private _isOpen;
    private _peers;
    private _opts;
    private _connectOpts?;
    private _attemptsLeft;
    private _maxAttempts;
    private _shouldReconnect;
    constructor(opts: WebSocketTransportOptions);
    get localPeerId(): string;
    get isOpen(): boolean;
    get remotePeerIds(): ReadonlySet<string>;
    connect(opts: TransportConnectOptions): Promise<void>;
    private _open;
    close(): void;
    send(payload: TransportPayload, targetPeerId?: string): void;
}
