/**
 * NetUser: per-peer state owned by a NetSession. One NetUser exists for
 * every remote peer that has joined the room. The local user is *not*
 * represented as a NetUser — it lives in NetSession itself.
 *
 * NetUser is the public surface most apps interact with: read `avatar` to
 * place children in 3D space, read `lastSeenMs` to detect stale peers,
 * subscribe to `displayName` changes, etc.
 */
import { PeerCapabilities, PeerRole } from './codec/MessageCodec';
import { RemoteUserAvatar } from './presence/RemoteUserAvatar';
export declare class NetUser {
    readonly peerId: string;
    displayName?: string;
    /**
     * Self-reported peer role. Cooperative metadata only — do not trust
     * for authority decisions. Defaults to `'user'` when the remote did
     * not send one.
     */
    role: PeerRole;
    capabilities: PeerCapabilities;
    /** Three.js avatar — also a child of `xb.core.scene` while the peer is connected. */
    readonly avatar: RemoteUserAvatar;
    /** Wall-clock ms of the last received message from this peer. */
    lastSeenMs: number;
    constructor(peerId: string, capabilities: PeerCapabilities, displayName?: string, role?: PeerRole);
    dispose(): void;
}
