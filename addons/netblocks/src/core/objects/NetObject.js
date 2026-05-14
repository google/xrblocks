import * as THREE from 'three';
import { makeId } from '../utils/IdUtils.js';

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
class NetObject extends THREE.Group {
    constructor(opts = {}) {
        super();
        /** Local-only state object that consumers can populate; sent alongside transforms. */
        this.state = {};
        /** Last-applied remote transform (used by NetSession for interpolation). */
        this._targetPosition = new THREE.Vector3();
        this._targetQuaternion = new THREE.Quaternion();
        this._targetScale = new THREE.Vector3(1, 1, 1);
        this._hasTarget = false;
        this._lastSendMs = 0;
        /**
         * True once this object has had any locally-observed motion (owner
         * broadcast, remote update, or snapshot apply). NetSession only echoes
         * `_dirty` objects in late-join snapshots — pristine constructor copies
         * have no useful state to share, and broadcasting them would cause peers
         * who already moved the object to snap back to defaults.
         */
        this._dirty = false;
        /**
         * Set on receipt of `netobject.release`. Allows the interpolation loop
         * to keep stepping toward the final transform after `ownerId` has been
         * cleared, so the unrendered tail of motion (we render ~100ms behind
         * real-time) doesn't appear as a visible jump on let-go. Cleared when
         * the local position has converged to the target, by `applyClaim`, or
         * by an immediate snap (`snapToXform`).
         */
        this._pendingFinal = false;
        this.netId = opts.id ?? `obj_${makeId(10)}`;
        this.ownerId = opts.ownerId ?? '';
        this.name = `NetObject(${this.netId})`;
    }
    /** True if the local peer currently owns this object. */
    isOwnedBy(peerId) {
        return this.ownerId === peerId;
    }
    /**
     * Snapshot the current local transform to a 10-element array suitable
     * for inclusion in a NetObjectMessage. Symmetric with `setTargetXform`,
     * which writes back into local position/quaternion/scale.
     */
    toXform() {
        const p = this.position;
        const q = this.quaternion;
        const s = this.scale;
        return [p.x, p.y, p.z, q.x, q.y, q.z, q.w, s.x, s.y, s.z];
    }
    /** Replace the target transform from a wire xform array. */
    setTargetXform(x) {
        this._targetPosition.set(x[0], x[1], x[2]);
        this._targetQuaternion.set(x[3], x[4], x[5], x[6]);
        this._targetScale.set(x[7], x[8], x[9]);
        this._hasTarget = true;
        this._dirty = true;
    }
    /**
     * Snap the local transform immediately to a wire xform array and clear
     * any pending interpolation target. Used by snapshot catch-up so the
     * late joiner lands exactly on the current pose without a visible lerp
     * from defaults.
     */
    snapToXform(x) {
        this.position.set(x[0], x[1], x[2]);
        this.quaternion.set(x[3], x[4], x[5], x[6]);
        this.scale.set(x[7], x[8], x[9]);
        this._hasTarget = false;
        this._pendingFinal = false;
        this._dirty = true;
    }
    /**
     * Smoothly drive the local transform toward the target. Called by
     * NetSession on non-owner peers. `t` is the per-frame lerp coefficient
     * (typically dt * 12). When `_pendingFinal` is set (post-release), the
     * caller continues stepping until we converge; once we're within a
     * sub-millimetre threshold we copy exactly and clear the flag so we
     * stop doing pointless math.
     */
    stepInterpolation(t) {
        if (!this._hasTarget)
            return;
        const k = Math.min(1, t);
        this.position.lerp(this._targetPosition, k);
        this.quaternion.slerp(this._targetQuaternion, k);
        this.scale.lerp(this._targetScale, k);
        if (this._pendingFinal &&
            this.position.distanceToSquared(this._targetPosition) < 1e-6) {
            this.position.copy(this._targetPosition);
            this.quaternion.copy(this._targetQuaternion);
            this.scale.copy(this._targetScale);
            this._pendingFinal = false;
            this._hasTarget = false;
        }
    }
}

export { NetObject };
