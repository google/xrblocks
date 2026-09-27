//#region src/addons/netblocks/src/core/objects/NetObjectRegistry.ts
function readClaim(counter, peerId) {
	if (!Number.isSafeInteger(counter) || counter < 1 || counter >= Number.MAX_SAFE_INTEGER || typeof peerId !== "string" || !peerId || peerId.length > 128) throw new Error("Invalid NetObject claim revision.");
	return {
		counter,
		peerId
	};
}
function compareClaim(a, b) {
	return a.counter - b.counter || (a.peerId === b.peerId ? 0 : a.peerId < b.peerId ? 1 : -1);
}
var NetObjectRegistry = class {
	constructor() {
		this._byId = /* @__PURE__ */ new Map();
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
	* Apply a causal explicit claim. A later counter preempts; equal counters
	* choose the lex-smaller peer ID. Legacy unstamped claims still preempt.
	*/
	applyClaim(id, peerId, counter) {
		const obj = this._byId.get(id);
		if (!obj) return false;
		const claim = counter === void 0 ? void 0 : readClaim(counter, peerId);
		if (claim && obj.claim) {
			const order = compareClaim(claim, obj.claim);
			if (order < 0 || order === 0 && obj.ownerId !== peerId) return false;
		}
		obj.claim = claim;
		if (obj.ownerId !== peerId) {
			obj.ownerId = peerId;
			obj._hasTarget = false;
			obj._pendingFinal = false;
		}
		return true;
	}
	/** Apply a "release" — only the current owner may release. */
	applyRelease(id, peerId, counter) {
		const obj = this._byId.get(id);
		if (!obj) return false;
		if (counter !== void 0) {
			const claim = readClaim(counter, peerId);
			if (!obj.claim || compareClaim(claim, obj.claim) !== 0) return false;
		}
		if (obj.ownerId !== peerId) return false;
		obj.ownerId = "";
		obj._hasTarget = false;
		return true;
	}
	/** Adopt catch-up ownership without overwriting a newer claim or reviving a release. */
	applyOwnershipSnapshot(id, ownerId, revision) {
		const obj = this._byId.get(id);
		if (!obj) return false;
		const claim = revision && readClaim(revision.counter, revision.peerId);
		if (!claim && obj.claim) return false;
		if (claim && ownerId && ownerId !== claim.peerId) throw new Error("NetObject snapshot owner does not match its claim.");
		if (claim && obj.claim) {
			const order = compareClaim(claim, obj.claim);
			if (order < 0 || order === 0 && !obj.ownerId && !!ownerId) return false;
		}
		obj.claim = claim;
		obj.ownerId = ownerId;
		return true;
	}
	/** When a peer leaves, drop their ownership claims so others can take over. */
	releaseOwnedBy(peerId) {
		for (const obj of this._byId.values()) if (obj.ownerId === peerId) obj.ownerId = "";
	}
};
//#endregion
export { NetObjectRegistry };
