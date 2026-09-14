/**
 * NetObject: an Object3D wrapper whose transform is replicated to all other
 * peers on a fixed cadence. The peer that *creates* the NetObject becomes
 * its initial owner; other peers may "claim" it (e.g., when grabbed) by
 * calling `claim()`. The current owner is the only peer that broadcasts
 * authoritative transform updates; non-owners interpolate.
 *
 * Ownership is cooperative: there is no central arbiter. A later observed
 * explicit claim preempts its predecessor. Crossed claims at the same logical
 * counter select the lex-smaller peer ID, independent of arrival order.
 *
 * NetObjects are normal three.js Object3Ds; you can `.add()` any meshes to
 * them. Each frame, NetSession applies remote updates to the local
 * transform if we don't currently own the object. Pass `object` to bind an
 * existing Object3D's local transform instead, without changing its hierarchy
 * or taking ownership of its resources.
 */
import * as THREE from 'three';
export interface NetObjectClaim {
    counter: number;
    peerId: string;
}
export interface NetObjectOptions {
    /** Stable id for this object across peers. Defaults to a fresh random id. */
    id?: string;
    /** Initial owner peer id. NetSession sets this to the local peer id when the object is created locally. */
    ownerId?: string;
    /** Existing local-transform target. Not reparented or disposed; defaults to the NetObject itself. */
    object?: THREE.Object3D;
    /** Participate in generic session catch-up. Disable when a higher-level protocol owns snapshots. */
    automaticSnapshots?: boolean;
}
export declare class NetObject extends THREE.Group {
    readonly netId: string;
    ownerId: string;
    /** Last explicit claim, retained after release for causal handoff and catch-up. */
    claim?: NetObjectClaim;
    /** The replicated local-transform target; this NetObject unless supplied in options. */
    readonly object: THREE.Object3D;
    readonly automaticSnapshots: boolean;
    /** Local-only state object that consumers can populate; sent alongside transforms. */
    state: Record<string, unknown>;
    /** Last-applied remote transform (used by NetSession for interpolation). */
    _targetPosition: THREE.Vector3;
    _targetQuaternion: THREE.Quaternion;
    _targetScale: THREE.Vector3;
    _hasTarget: boolean;
    _lastSendMs: number;
    /**
     * True once this object has had any locally-observed motion (owner
     * broadcast, remote update, or snapshot apply). NetSession only echoes
     * `_dirty` objects in late-join snapshots — pristine constructor copies
     * have no useful state to share, and broadcasting them would cause peers
     * who already moved the object to snap back to defaults.
     */
    _dirty: boolean;
    /**
     * Set on receipt of `netobject.release`. Allows the interpolation loop
     * to keep stepping toward the final transform after `ownerId` has been
     * cleared, so the unrendered tail of motion (we render ~100ms behind
     * real-time) doesn't appear as a visible jump on let-go. Cleared when
     * the local position has converged to the target, by `applyClaim`, or
     * by an immediate snap (`snapToXform`).
     */
    _pendingFinal: boolean;
    constructor(opts?: NetObjectOptions);
    /** True if the local peer currently owns this object. */
    isOwnedBy(peerId: string): boolean;
    /**
     * Snapshot the object's current local transform to a 10-element array
     * suitable for inclusion in a NetObjectMessage. Symmetric with
     * `snapToXform`, which writes back into local position/quaternion/scale.
     */
    toXform(): number[];
    /** Replace the target transform from a wire xform array. */
    setTargetXform(x: number[]): void;
    /**
     * Snap the local transform immediately to a wire xform array and clear
     * any pending interpolation target. Used by snapshot catch-up so the
     * late joiner lands exactly on the current pose without a visible lerp
     * from defaults.
     */
    snapToXform(x: number[]): void;
    /**
     * Smoothly drive the local transform toward the target. Called by
     * NetSession on non-owner peers. `t` is the per-frame lerp coefficient
     * (typically dt * 12). When `_pendingFinal` is set (post-release), the
     * caller continues stepping until we converge; once we're within a
     * sub-millimetre threshold we copy exactly and clear the flag so we
     * stop doing pointless math.
     */
    stepInterpolation(t: number): void;
}
