/**
 * NetSession: the orchestrator that lives between a Transport and the rest
 * of netblocks. Responsibilities:
 *
 *   - Wraps a Transport, owns the local peer id, and maintains a Map of
 *     active NetUsers.
 *   - Encodes every outbound NetMessage (adding `from`, `ts`) and decodes
 *     every inbound payload, dispatching to:
 *       * PresenceBroadcaster (outbound pose)  / pose buffer per NetUser (inbound)
 *       * NetEvents bus (typed RPC)
 *       * NetObjectRegistry (replicated transforms + ownership)
 *       * VoiceChat (out-of-band SDP/ICE signaling)
 *   - Per-frame `update()` drives presence broadcasting, smooth interpolation
 *     of remote avatars and net objects, and broadcasting transforms for
 *     locally-owned net objects.
 *   - Emits high-level events (`user-join`, `user-leave`) for the host app.
 *
 * The root xrblocks `Script` passed in is used purely as a scene-graph
 * mount point for remote avatars; netblocks never manipulates the host
 * script's properties.
 */
import * as THREE from 'three';
import { PeerRole } from './codec/MessageCodec';
import { NetObject } from './objects/NetObject';
import { NetObjectRegistry } from './objects/NetObjectRegistry';
import { NetUser } from './NetUser';
import { PresenceBroadcaster } from './presence/PresenceBroadcaster';
import { NetEvents } from './rpc/NetEvents';
import { Transport } from './transport/Transport';
import { VoiceChat } from './voice/VoiceChat';
export interface NetSessionOptions {
    /** Display name announced to other peers. */
    displayName?: string;
    /**
     * Coarse role announced to other peers. Defaults to `'user'`. Use
     * `'agent'` for autonomous bots and `'device'` for shared/headless
     * room participants (TVs, kiosks, etc).
     */
    role?: PeerRole;
    /** Override the presence broadcast frequency in Hz (default: 20). */
    presenceHz?: number;
    /** Override the netobject broadcast frequency in Hz (default: 20). */
    netObjectHz?: number;
    /**
     * Convergence rate for non-owner interpolation, expressed as the
     * exponential decay constant in `1 - exp(-rate * dt)`. Higher values
     * snap faster. Default 12 matches the legacy fixed-fraction behaviour
     * at 60 fps; at 90/120 Hz the dt-based form keeps the convergence
     * speed visually identical instead of overshooting.
     */
    netObjectInterpRate?: number;
    /** Whether to enable voice chat at session start. Defaults to false. */
    voice?: boolean;
}
export type NetSessionEventName = 'open' | 'close' | 'user-join' | 'user-leave' | 'voice-state' | 'local-voice-state';
export interface UserEventDetail {
    user: NetUser;
}
export declare class NetSession extends EventTarget {
    readonly transport: Transport;
    readonly events: NetEvents;
    readonly netObjects: NetObjectRegistry;
    readonly presence: PresenceBroadcaster;
    readonly voice: VoiceChat;
    private _root;
    private _users;
    /**
     * Tracks users we created from a non-hello first message. We defer
     * `user-join` until either their hello arrives (so the listener sees a
     * populated displayName) or a small grace window elapses.
     */
    private _pendingJoinTimers;
    private _opts;
    private _spatialVoice?;
    private _isOpen;
    private _lastUpdateMs;
    private _capabilities;
    private _onTransportPeerJoin;
    private _onTransportPeerLeave;
    private _onTransportMessage;
    private _onPageHide;
    constructor(transport: Transport, root: THREE.Object3D, opts?: NetSessionOptions);
    get isOpen(): boolean;
    get localPeerId(): string;
    /** Local display name, as supplied via `NetSessionOptions.displayName`. */
    get displayName(): string | undefined;
    /** Local self-reported role. Defaults to `'user'`. */
    get role(): PeerRole;
    get users(): ReadonlyMap<string, NetUser>;
    /** Connect the underlying transport and announce ourselves. */
    open(roomId: string): Promise<void>;
    close(): void;
    /** Register an existing NetObject so its transform is replicated. */
    addNetObject(obj: NetObject): void;
    /** Convenience: create + auto-add a NetObject parented to `root`. */
    createNetObject(opts?: ConstructorParameters<typeof NetObject>[0]): NetObject;
    removeNetObject(obj: NetObject): void;
    /** Claim ownership of an object (e.g., on grab). */
    claim(obj: NetObject): void;
    /** Release ownership of an object (e.g., on release). */
    release(obj: NetObject): void;
    /** Per-frame tick. Call from the host xb.Script's `update()`. */
    update(_time?: number, _frame?: XRFrame): void;
    private _sendNet;
    private _onPeerJoin;
    private _onPeerLeave;
    private _onMessage;
    private _onVoiceTrack;
    private _onVoiceTrackRemoved;
}
