/**
 * NetObject: an Object3D wrapper whose transform is replicated to all other
 * peers on a fixed cadence. The peer that *creates* the NetObject becomes
 * its initial owner; other peers may "claim" it (e.g., when grabbed) by
 * calling `claim()`. The current owner is the only peer that broadcasts
 * authoritative transform updates; non-owners interpolate.
 *
 * Ownership is cooperative — there is no central arbiter. Explicit claims
 * always preempt the previous owner so users can hand off / steal objects;
 * the only deterministic tiebreak left is for the rare case where two peers
 * implicitly auto-own the same id at create-time (see NetSession's
 * `netobject` handler), where the lex-smaller peer id wins.
 *
 * NetObjects are normal three.js Object3Ds; you can `.add()` any meshes to
 * them. Each frame, NetSession applies remote updates to the local
 * transform if we don't currently own the object.
 */
import * as THREE from 'three';
export interface NetObjectOptions {
    /** Stable id for this object across peers. Defaults to a fresh random id. */
    id?: string;
    /** Initial owner peer id. NetSession sets this to the local peer id when the object is created locally. */
    ownerId?: string;
}
export declare class NetObject extends THREE.Group {
    readonly netId: string;
    ownerId: string;
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
     * Snapshot the current local transform to a 10-element array suitable
     * for inclusion in a NetObjectMessage. Symmetric with `setTargetXform`,
     * which writes back into local position/quaternion/scale.
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
