import { Transport, TransportConnectOptions, TransportPayload } from './Transport';
export declare class BroadcastChannelTransport extends Transport {
    readonly name = "BroadcastChannel";
    private _channel?;
    private _localPeerId;
    private _isOpen;
    private _peers;
    private _peerSeenAt;
    private _helloTimer?;
    private _gcTimer?;
    private _pageHideHandler;
    get localPeerId(): string;
    get isOpen(): boolean;
    get remotePeerIds(): ReadonlySet<string>;
    connect(opts: TransportConnectOptions): Promise<void>;
    close(): void;
    send(payload: TransportPayload, targetPeerId?: string): void;
    private _sendBye;
    private _sendEnvelope;
    private _onChannelMessage;
    private _gcPeers;
    private _removePeer;
}
