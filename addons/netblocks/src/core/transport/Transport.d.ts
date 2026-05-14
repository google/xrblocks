/**
 * Transport: the contract every netblocks transport must satisfy.
 *
 * A Transport is responsible for:
 *  - Establishing a connection to a "room" (any string id).
 *  - Reporting peer join/leave events as the local view of room membership
 *    changes.
 *  - Sending an opaque byte payload either to a specific peer or as a
 *    broadcast to every other peer in the room.
 *  - Surfacing inbound messages with the sender's peer id.
 *
 * The Transport intentionally knows nothing about the netblocks message
 * protocol — it just moves bytes. NetSession layers presence, RPC, etc. on
 * top via MessageCodec.
 *
 * All transports are EventTarget subclasses so that consumers can use the
 * standard `addEventListener` / `removeEventListener` API.
 */
export type TransportPayload = Uint8Array;
export interface TransportConnectOptions {
    /** Application-specific room identifier. Peers in the same room see each other. */
    roomId: string;
    /**
     * Optional override for the local peer id. If omitted, the transport
     * generates one. Stable peer ids are useful for reconnection scenarios.
     */
    peerId?: string;
}
export interface TransportPeerEventDetail {
    peerId: string;
}
export interface TransportMessageEventDetail {
    peerId: string;
    data: TransportPayload;
}
/**
 * `peer-join` and `peer-leave` are dispatched as
 * `CustomEvent\<TransportPeerEventDetail\>`.
 * `message` is dispatched as `CustomEvent\<TransportMessageEventDetail\>`.
 * `error` is dispatched as `CustomEvent\<\{error: Error\}\>`.
 * `close` is dispatched as `Event` without detail.
 */
export type TransportEventName = 'open' | 'close' | 'error' | 'peer-join' | 'peer-leave' | 'message';
export declare abstract class Transport extends EventTarget {
    /** The local peer id. Defined after `connect` resolves. */
    abstract readonly localPeerId: string;
    /** True between a successful `connect` and a `close`. */
    abstract readonly isOpen: boolean;
    /** All currently-known remote peer ids. */
    abstract readonly remotePeerIds: ReadonlySet<string>;
    /** A short, human-friendly transport name used for logging/UX. */
    abstract readonly name: string;
    /** Connect to the room. Must be called exactly once per instance. */
    abstract connect(opts: TransportConnectOptions): Promise<void>;
    /** Disconnect; idempotent. */
    abstract close(): void;
    /**
     * Send a payload to a specific peer or broadcast to all known peers when
     * `targetPeerId` is omitted.
     */
    abstract send(payload: TransportPayload, targetPeerId?: string): void;
    /** Convenience: typed event subscription. */
    on<K extends TransportEventName>(type: K, listener: (event: CustomEvent) => void): void;
    off<K extends TransportEventName>(type: K, listener: (event: CustomEvent) => void): void;
    protected emitPeerJoin(peerId: string): void;
    protected emitPeerLeave(peerId: string): void;
    protected emitMessage(peerId: string, data: TransportPayload): void;
    protected emitError(error: Error): void;
}
