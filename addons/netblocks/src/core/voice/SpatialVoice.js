import * as THREE from "three";
//#region src/addons/netblocks/src/core/voice/SpatialVoice.ts
/**
* SpatialVoice: maps each remote peer to a `THREE.PositionalAudio` node
* parented to that peer's RemoteUserAvatar head pivot, so their voice
* spatializes with their position. The local microphone capture and the
* RTCPeerConnection wiring lives in VoiceChat — SpatialVoice is the
* "render layer" that places remote audio in 3D.
*
* This class is mostly a thin three.js wrapper, kept separate so apps can
* swap in custom HRTF panners or attach a UI volume slider without
* monkey-patching VoiceChat.
*/
var SpatialVoice = class {
	/**
	* @param listener - The shared `THREE.AudioListener` to spatialize against —
	*   typically `xb.core.sound.listener`, which CoreSound has already attached
	*   to the camera. SpatialVoice does NOT take ownership: it never adds or
	*   removes the listener from the scene, so disposing SpatialVoice leaves
	*   CoreSound's audio path untouched.
	*/
	constructor(listener, opts = {}) {
		this._byPeer = /* @__PURE__ */ new Map();
		this._primersByPeer = /* @__PURE__ */ new Map();
		this.listener = listener;
		this._opts = {
			refDistance: opts.refDistance ?? .5,
			rolloffFactor: opts.rolloffFactor ?? 4,
			maxDistance: opts.maxDistance ?? 20
		};
	}
	/**
	* Attach a MediaStream to a peer; (re-)creates the PositionalAudio node and
	* parents it to `parent` (typically the remote user's headPivot).
	* `muted` is applied before connecting the source, including replacements.
	*/
	attach(peerId, parent, stream, muted = false) {
		this._validatePlayback(peerId, muted);
		this.detach(peerId);
		const audio = new THREE.PositionalAudio(this.listener);
		this._setMuted(audio, muted);
		audio.setRefDistance(this._opts.refDistance);
		audio.setRolloffFactor(this._opts.rolloffFactor);
		audio.setMaxDistance(this._opts.maxDistance);
		audio.setDistanceModel("inverse");
		audio.panner.panningModel = "HRTF";
		const ctx = audio.context;
		ctx.resume?.().catch(() => void 0);
		const src = ctx.createMediaStreamSource(stream);
		audio.setNodeSource(src);
		if (typeof document !== "undefined") {
			const primer = document.createElement("audio");
			primer.muted = true;
			primer.autoplay = true;
			primer.srcObject = stream;
			primer.play().catch(() => {});
			this._primersByPeer.set(peerId, primer);
		}
		parent.add(audio);
		this._byPeer.set(peerId, audio);
	}
	/**
	* Apply an effective mute to an attached peer's own gain only.
	* Preferences for future streams are owned by NetSession, not this graph.
	*/
	setPlaybackMuted(peerId, muted) {
		this._validatePlayback(peerId, muted);
		const audio = this._byPeer.get(peerId);
		if (audio) this._setMuted(audio, muted);
	}
	_validatePlayback(peerId, muted) {
		if (typeof peerId !== "string" || !peerId.trim()) throw new TypeError("peerId must be a non-empty string");
		if (typeof muted !== "boolean") throw new TypeError("muted must be a boolean");
	}
	_setMuted(audio, muted) {
		const now = audio.context.currentTime;
		audio.gain.gain.cancelScheduledValues(now);
		audio.gain.gain.setValueAtTime(muted ? 0 : 1, now);
	}
	detach(peerId) {
		const audio = this._byPeer.get(peerId);
		if (audio) {
			audio.parent?.remove(audio);
			audio.disconnect();
			audio.gain.disconnect();
			this._byPeer.delete(peerId);
		}
		const primer = this._primersByPeer.get(peerId);
		if (primer) {
			try {
				primer.pause();
			} catch {}
			primer.srcObject = null;
			this._primersByPeer.delete(peerId);
		}
	}
	dispose() {
		for (const id of [...this._byPeer.keys()]) this.detach(id);
	}
};
//#endregion
export { SpatialVoice };
