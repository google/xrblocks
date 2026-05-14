import { Transport, TransportConnectOptions, TransportPayload } from './Transport';
export interface WebRTCTransportOptions {
    /** Override the default PeerJS broker URL. If not supplied, the public broker is used. */
    signalingUrl?: string;
    /** ICE servers (STUN/TURN). Defaults to Google's public STUN. */
    iceServers?: RTCIceServer[];
    /** Optional broker key (PeerJS uses 'peerjs' for the public host). */
    brokerKey?: string;
}
export declare class WebRTCTransport extends Transport {
    readonly name = "WebRTC";
    private _signaling?;
    private _localPeerId;
    private _roomId;
    private _isOpen;
    private _opts;
    private _peers;
    private _entries;
    private _discoveryTimer?;
    private _discoveryIntervalMs;
    private _heartbeatTimer?;
    constructor(opts?: WebRTCTransportOptions);
    get localPeerId(): string;
    get isOpen(): boolean;
    get remotePeerIds(): ReadonlySet<string>;
    connect(opts: TransportConnectOptions): Promise<void>;
    close(): void;
    send(payload: TransportPayload, targetPeerId?: string): void;
    private _sendTo;
    private _hashRoom;
    private _defaultBrokerUrl;
    private _brokerUrlForId;
    /**
     * Attempt to register `candidateId` with the broker. Resolves on `OPEN`,
     * rejects on `ID-TAKEN` or any other failure (caller will try the next slot).
     */
    private _tryClaimSlot;
    /**
     * Discover & connect to other peers. Two invariants protect us from the
     * PeerJS broker's behaviour of closing our signaling WS the moment we
     * forward a message to a non-existent `dst`:
     *
     *   1. Only HIGHER slots initiate to LOWER slots. By construction, if I
     *      claimed slot N, slots 0..N-1 were occupied at the moment I claimed
     *      (that's *why* N was the lowest free slot for me).
     *   2. For ongoing periodic discovery (peers may come and go), we
     *      probe-before-OFFER: open a transient WS for the candidate id; if
     *      the broker rejects with `ID-TAKEN` the slot is occupied so it's
     *      safe to OFFER, otherwise the slot is empty and we skip.
     *
     * Glare is impossible because only one side (higher slot) ever initiates.
     */
    private _discover;
    /**
     * Open a short-lived probing WS to `candidateId`. If the broker rejects
     * with `ID-TAKEN`, the slot is currently held by another peer and it is
     * safe to send an OFFER from our long-lived signaling WS. If the broker
     * accepts (`OPEN`), the slot is free and we skip — sending an OFFER to a
     * non-existent `dst` would cause the broker to disconnect us.
     */
    private _probeAndOffer;
    private _send;
    private _handleSignal;
    private _ensureEntry;
    private _attachChannel;
    private _initiate;
    private _handleOffer;
    private _handleAnswer;
    /** Deterministic connection id per peer pair (sorted, broker requires it). */
    private _connectionId;
    private _handleCandidate;
    private _teardown;
}
