class NetObjectRegistry {
    constructor() {
        this._byId = new Map();
    }
    add(obj) {
        this._byId.set(obj.netId, obj);
    }
    remove(obj) {
        this._byId.delete(obj.netId);
    }
    get(id) {
        return this._byId.get(id);
    }
    has(id) {
        return this._byId.has(id);
    }
    values() {
        return this._byId.values();
    }
    /**
     * Apply a "claim" message: peer wants ownership. Always grants the
     * claim — explicit grabs are intentional and should preempt the
     * previous owner so users can pass objects between each other. (The
     * older lex-tiebreak only made sense for racing implicit claims.)
     */
    applyClaim(id, peerId) {
        const obj = this._byId.get(id);
        if (!obj)
            return false;
        if (obj.ownerId !== peerId) {
            obj.ownerId = peerId;
            // Drop any stale interp target buffered from a previous remote-owner
            // period; otherwise the new ownership state would lerp the object
            // back toward an ancient position before the new owner sends one.
            // Also abandon any post-release interpolation in flight — the new
            // owner is about to take over and broadcast their own pose.
            obj._hasTarget = false;
            obj._pendingFinal = false;
        }
        return true;
    }
    /** Apply a "release" — only the current owner may release. */
    applyRelease(id, peerId) {
        const obj = this._byId.get(id);
        if (!obj)
            return false;
        if (obj.ownerId !== peerId)
            return false;
        obj.ownerId = '';
        obj._hasTarget = false;
        return true;
    }
    /** When a peer leaves, drop their ownership claims so others can take over. */
    releaseOwnedBy(peerId) {
        for (const obj of this._byId.values()) {
            if (obj.ownerId === peerId)
                obj.ownerId = '';
        }
    }
}

export { NetObjectRegistry };
