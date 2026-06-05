export type NetMessage = HelloMessage | WelcomeMessage | ByeMessage | PingMessage | PongMessage | PoseMessage | NetObjectMessage | NetObjectClaimMessage | NetObjectReleaseMessage | NetObjectSnapshotMessage | RpcMessage | VoiceSignalMessage;
export interface BaseMessage {
    /** Sender peer id. Filled in by the session before broadcast. */
    from?: string;
    /** Optional target peer id. If undefined, the message is broadcast. */
    to?: string;
    /** Wall-clock timestamp (ms) at the sender. */
    ts?: number;
}
/**
 * Coarse role label for a peer. Cooperative metadata only — like
 * `displayName`, peers self-report this and netblocks does not verify
 * it. Useful for UI ("show only humans", "filter agents") and for
 * routing (e.g. only forward chat to other `'user'` peers).
 */
export type PeerRole = 'user' | 'device' | 'agent';
export interface HelloMessage extends BaseMessage {
    type: 'hello';
    protocol: number;
    displayName?: string;
    role?: PeerRole;
    capabilities: PeerCapabilities;
}
export interface WelcomeMessage extends BaseMessage {
    type: 'welcome';
    peers: Array<{
        id: string;
        displayName?: string;
        role?: PeerRole;
        capabilities: PeerCapabilities;
    }>;
}
export interface ByeMessage extends BaseMessage {
    type: 'bye';
}
export interface PingMessage extends BaseMessage {
    type: 'ping';
    nonce: number;
}
export interface PongMessage extends BaseMessage {
    type: 'pong';
    nonce: number;
}
export interface PoseMessage extends BaseMessage {
    type: 'pose';
    /** Base64-encoded binary pose frame (see PoseCodec). */
    data: string;
}
export interface NetObjectMessage extends BaseMessage {
    type: 'netobject';
    id: string;
    /** Compact transform: [px, py, pz, qx, qy, qz, qw, sx, sy, sz]. */
    xform: number[];
    /** Optional small JSON state payload, capped by MAX_MESSAGE_BYTES. */
    state?: unknown;
}
export interface NetObjectClaimMessage extends BaseMessage {
    type: 'netobject.claim';
    id: string;
}
export interface NetObjectReleaseMessage extends BaseMessage {
    type: 'netobject.release';
    id: string;
    /**
     * Optional final canonical transform. When present, receivers snap the
     * object to this xform on release so peers whose interpolation hadn't
     * converged don't end up showing a stale resting position.
     */
    xform?: number[];
    /** Optional small JSON state payload, capped by MAX_MESSAGE_BYTES. */
    state?: unknown;
}
/**
 * Late-join state catch-up: existing peers send this to a newly-joined peer
 * right after the welcome handshake so the joiner sees the current
 * transform/owner/state of every replicated object instead of the stale
 * constructor defaults. Only the owner of an object would otherwise be
 * broadcasting `netobject` updates, so unowned (post-release) objects have
 * no other path to reach a late joiner.
 */
export interface NetObjectSnapshotMessage extends BaseMessage {
    type: 'netobject.snapshot';
    objects: Array<{
        id: string;
        xform: number[];
        ownerId: string;
        state?: unknown;
    }>;
}
export interface RpcMessage extends BaseMessage {
    type: 'rpc';
    topic: string;
    payload: unknown;
}
/** Out-of-band signaling for WebRTC voice streams over the data channel. */
export interface VoiceSignalMessage extends BaseMessage {
    type: 'voice';
    signal: {
        kind: 'offer';
        sdp: string;
    } | {
        kind: 'answer';
        sdp: string;
    } | {
        kind: 'ice';
        candidate: RTCIceCandidateInit;
    } | {
        kind: 'bye';
    } | {
        kind: 'hello';
    };
}
export interface PeerCapabilities {
    pose: boolean;
    voice: boolean;
    netobject: boolean;
}
/**
 * Encode a NetMessage as bytes. The on-the-wire format is JSON for the
 * envelope; pose payloads are pre-encoded as base64 inside `data`.
 */
export declare function encodeMessage(msg: NetMessage): Uint8Array;
export declare function decodeMessage(data: Uint8Array | ArrayBuffer | string): NetMessage;
export declare function makeHello(displayName: string | undefined, capabilities: PeerCapabilities, role?: PeerRole): HelloMessage;
