import * as THREE from 'three';
import { makeId } from '../utils/IdUtils.js';

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
        if (opts.automaticSnapshots !== undefined &&
            typeof opts.automaticSnapshots !== 'boolean') {
            throw new TypeError('automaticSnapshots must be a boolean.');
        }
        this.netId = opts.id ?? `obj_${makeId(10)}`;
        this.ownerId = opts.ownerId ?? '';
        this.object = opts.object ?? this;
        this.automaticSnapshots = opts.automaticSnapshots ?? true;
        this.name = `NetObject(${this.netId})`;
    }
    /** True if the local peer currently owns this object. */
    isOwnedBy(peerId) {
        return this.ownerId === peerId;
    }
    /**
     * Snapshot the object's current local transform to a 10-element array
     * suitable for inclusion in a NetObjectMessage. Symmetric with
     * `snapToXform`, which writes back into local position/quaternion/scale.
     */
    toXform() {
        const p = this.object.position;
        const q = this.object.quaternion;
        const s = this.object.scale;
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
        this.object.position.set(x[0], x[1], x[2]);
        this.object.quaternion.set(x[3], x[4], x[5], x[6]);
        this.object.scale.set(x[7], x[8], x[9]);
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
        this.object.position.lerp(this._targetPosition, k);
        this.object.quaternion.slerp(this._targetQuaternion, k);
        this.object.scale.lerp(this._targetScale, k);
        if (this._pendingFinal &&
            this.object.position.distanceToSquared(this._targetPosition) < 1e-6) {
            this.object.position.copy(this._targetPosition);
            this.object.quaternion.copy(this._targetQuaternion);
            this.object.scale.copy(this._targetScale);
            this._pendingFinal = false;
            this._hasTarget = false;
        }
    }
}

export { NetObject };
