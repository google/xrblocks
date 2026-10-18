//#region src/addons/netblocks/src/core/transport/Transport.ts
var Transport = class extends EventTarget {
	get supportsUnreliable() {
		return false;
	}
	/** Optional lossy lane. Never falls back to the reliable channel. */
	sendUnreliable(_payload, _targetPeerId) {
		return false;
	}
	/** Convenience: typed event subscription. */
	on(type, listener) {
		this.addEventListener(type, listener);
	}
	off(type, listener) {
		this.removeEventListener(type, listener);
	}
	emitPeerJoin(peerId) {
		this.dispatchEvent(new CustomEvent("peer-join", { detail: { peerId } }));
	}
	emitPeerLeave(peerId) {
		this.dispatchEvent(new CustomEvent("peer-leave", { detail: { peerId } }));
	}
	emitMessage(peerId, data, delivery = "reliable") {
		this.dispatchEvent(new CustomEvent("message", { detail: {
			peerId,
			data,
			...delivery === "unreliable" ? { delivery } : {}
		} }));
	}
	emitError(error) {
		this.dispatchEvent(new CustomEvent("error", { detail: { error } }));
	}
};
//#endregion
export { Transport };
