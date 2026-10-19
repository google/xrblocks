import { Transport, TransportConnectOptions, TransportPayload } from "./Transport.js";
//#region src/addons/netblocks/src/core/transport/WebRTCTransport.d.ts
export interface WebRTCTransportOptions {
  /** Override the default PeerJS broker URL. If not supplied, the public broker is used. */
  signalingUrl?: string;
  /** ICE servers (STUN/TURN). Defaults to Google's public STUN. */
  iceServers?: RTCIceServer[];
  /** Optional broker key (PeerJS uses 'peerjs' for the public host). */
  brokerKey?: string;
  /** Opt in to a separate unordered, zero-retransmission lane, negotiated with each peer. */
  unreliableChannel?: boolean;
  /** Opt in to rejecting broker changes to an open data connection. Default false. */
  protectOpenPeers?: boolean;
}
export declare class WebRTCTransport extends Transport {
  readonly name = "WebRTC";
  get supportsUnreliable(): boolean;
  private _signaling?;
  private _localPeerId;
  private _roomId;
  private _isOpen;
  private _closed;
  private _pendingSockets;
  private _probesInFlight;
  private _opts;
  private _peers;
  private _entries;
  private _discoveryTimer?;
  private _discoveryIntervalMs;
  private _heartbeatTimer?;
  private _signalingReconnect?;
  private _discoveryRequested;
  constructor(opts?: WebRTCTransportOptions);
  get localPeerId(): string;
  get isOpen(): boolean;
  /** Whether the broker socket is currently open, independently of data peers. */
  get isSignalingOpen(): boolean;
  get remotePeerIds(): ReadonlySet<string>;
  connect(opts: TransportConnectOptions): Promise<void>;
  /**
   * Explicitly reopen the broker registration without replacing live peer
   * connections or changing our peer ID. A taken slot rejects for caller retry.
   */
  reconnectSignaling(): Promise<void>;
  /** Opt-in one-off room discovery, without changing the normal backoff timer. */
  discoverPeers(): void;
  /** Locally close one peer, including a protected connection. Discovery remains caller-controlled. */
  dropPeer(peerId: string): void;
  close(): void;
  send(payload: TransportPayload, targetPeerId?: string): void;
  private _sendTo;
  /**
   * Queues a negotiated lossy message, at most 1,200 bytes and within the SCTP
   * limit and 16 KiB queued-byte budget. True means queued, not delivered.
   */
  sendUnreliable(payload: TransportPayload, targetPeerId: string): boolean;
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
  private _protectsOpenPeer;
  private _isRoomPeer;
  private _attachChannel;
  private _initiate;
  private _handleOffer;
  private _handleAnswer;
  /** Only the offerer creates the optional lane, after the answer and SCTP open. */
  private _createUnreliableChannel;
  /** Deterministic connection id per peer pair (sorted, broker requires it). */
  private _connectionId;
  private _handleCandidate;
  private _teardown;
}
//#endregion