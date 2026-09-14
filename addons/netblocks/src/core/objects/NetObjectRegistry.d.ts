/**
 * NetObjectRegistry: stores NetObjects by their id and resolves ownership
 * conflicts. Operations are intentionally O(1) and synchronous — netblocks
 * runs this in the per-frame update loop.
 *
 * **Security note (cooperative-only).** Ownership claims and releases are
 * trusted as-stated: the registry has no way to verify that a peer
 * claiming `obj` actually grabbed it on their end, and a malicious peer
 * could forge claims, refuse to release, or spoof another peer's id at
 * the transport layer. netblocks is demo-grade — for adversarial
 * environments, layer a server-authoritative arbiter on top.
 */
import { NetObject, type NetObjectClaim } from './NetObject';
export declare class NetObjectRegistry {
    private _byId;
    add(obj: NetObject): void;
    remove(obj: NetObject): void;
    get(id: string): NetObject | undefined;
    has(id: string): boolean;
    values(): IterableIterator<NetObject>;
    /**
     * Apply a causal explicit claim. A later counter preempts; equal counters
     * choose the lex-smaller peer ID. Legacy unstamped claims still preempt.
     */
    applyClaim(id: string, peerId: string, counter?: number): boolean;
    /** Apply a "release" — only the current owner may release. */
    applyRelease(id: string, peerId: string, counter?: number): boolean;
    /** Adopt catch-up ownership without overwriting a newer claim or reviving a release. */
    applyOwnershipSnapshot(id: string, ownerId: string, revision?: NetObjectClaim): boolean;
    /** When a peer leaves, drop their ownership claims so others can take over. */
    releaseOwnedBy(peerId: string): void;
}
