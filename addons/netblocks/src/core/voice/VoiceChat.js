import { DEFAULT_ICE_SERVERS } from "../constants/NetConstants.js";
//#region src/addons/netblocks/src/core/voice/VoiceChat.ts
var VoiceChat = class {
	constructor(send, opts = {}) {
		this._onTrack = /* @__PURE__ */ new Set();
		this._onTrackRemoved = /* @__PURE__ */ new Set();
		this._peers = /* @__PURE__ */ new Map();
		this._enabled = false;
		this._muted = false;
		this._localId = "";
		this._generation = 0;
		this._send = send;
		this._opts = {
			iceServers: opts.iceServers ?? DEFAULT_ICE_SERVERS,
			audioConstraints: opts.audioConstraints ?? {
				echoCancellation: true,
				noiseSuppression: true
			},
			onLocalStateChange: opts.onLocalStateChange ?? (() => {}),
			onLocalMuteChange: opts.onLocalMuteChange ?? (() => {}),
			onError: opts.onError ?? (() => {})
		};
	}
	setLocalPeerId(id) {
		this._localId = id;
	}
	/**
	* Subscribe to remote voice tracks. Multiple listeners can register;
	* each gets called once per remote `MediaStream`. Returns a function
	* that removes this listener (idempotent).
	*/
	onTrack(handler) {
		this._onTrack.add(handler);
		return () => {
			this._onTrack.delete(handler);
		};
	}
	/**
	* Subscribe to remote voice track removals. Multiple listeners can
	* register. Returns a function that removes this listener.
	*/
	onTrackRemoved(handler) {
		this._onTrackRemoved.add(handler);
		return () => {
			this._onTrackRemoved.delete(handler);
		};
	}
	isEnabled() {
		return this._enabled;
	}
	/** Whether this peer is not currently transmitting microphone audio. */
	isMuted() {
		return !this._enabled || this._muted;
	}
	/**
	* Cancel pending microphone requests and stop any late-granted tracks.
	* Leaves established capture and incoming peer connections untouched.
	*/
	cancelPendingEnable() {
		this._generation++;
	}
	/** Request mic + start negotiating with all currently-connected peers. */
	async enable(currentPeers) {
		if (this._enabled) return;
		if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) throw new Error("VoiceChat: getUserMedia is not available.");
		const gen = this._generation;
		const stream = await navigator.mediaDevices.getUserMedia({ audio: this._opts.audioConstraints });
		if (gen !== this._generation) {
			for (const t of stream.getTracks()) t.stop();
			return;
		}
		this._localStream = stream;
		this._enabled = true;
		this._muted = false;
		for (const track of stream.getTracks()) track.addEventListener("ended", () => {
			if (this._localStream !== stream) return;
			this.cancelPendingEnable();
			this._localStream = void 0;
			this._enabled = false;
			this._muted = false;
			for (const t of stream.getTracks()) t.stop();
			this._opts.onLocalStateChange(false);
			this._reportError(/* @__PURE__ */ new Error("Microphone capture ended. Unmute to reconnect the microphone."));
		}, { once: true });
		this._opts.onLocalStateChange(true);
		const replacements = [];
		for (const [pid, entry] of this._peers) {
			const senders = entry.pc.getSenders();
			if (senders.some((s) => s.track?.kind === "audio" && s.track.readyState === "live")) continue;
			const endedSenders = senders.filter((s) => s.track?.readyState === "ended");
			let addedTrack = false;
			for (const t of stream.getTracks()) {
				const index = endedSenders.findIndex((s) => s.track?.kind === t.kind);
				if (index !== -1) {
					const [sender] = endedSenders.splice(index, 1);
					replacements.push(sender.replaceTrack(t).catch((err) => this._reportError(err, pid)));
				} else {
					entry.pc.addTrack(t, stream);
					addedTrack = true;
				}
			}
			if (addedTrack) this._makeOffer(pid, entry);
		}
		for (const pid of currentPeers) {
			if (this._peers.has(pid)) continue;
			this.notifyPeerJoined(pid);
		}
		await Promise.all(replacements);
	}
	disable() {
		const wasEnabled = this._enabled;
		this._enabled = false;
		this._muted = false;
		this.cancelPendingEnable();
		for (const [pid] of this._peers) this._send({
			type: "voice",
			to: pid,
			signal: { kind: "bye" }
		});
		for (const [pid] of this._peers) this._teardown(pid);
		this._localStream?.getTracks().forEach((t) => t.stop());
		this._localStream = void 0;
		if (wasEnabled) this._opts.onLocalStateChange(false);
	}
	/** Mute/unmute the local mic without tearing connections down. */
	setMuted(muted) {
		if (!this._enabled || this._muted === muted) return;
		this._localStream?.getAudioTracks().forEach((t) => t.enabled = !muted);
		this._muted = muted;
		this._opts.onLocalMuteChange(muted);
	}
	/** NetSession invokes this on peer-join so we can negotiate. */
	notifyPeerJoined(peerId) {
		if (!this._enabled || this._peers.has(peerId)) return;
		const asOfferer = this._localId < peerId;
		this._connectTo(peerId, asOfferer);
		if (!asOfferer) this._send({
			type: "voice",
			to: peerId,
			signal: { kind: "hello" }
		});
	}
	notifyPeerLeft(peerId) {
		this._teardown(peerId);
	}
	/** NetSession routes inbound voice signals here. */
	async handleSignal(from, msg) {
		const sig = msg.signal;
		if (sig.kind === "bye") {
			this._teardown(from);
			return;
		}
		if (sig.kind === "hello") {
			if (this._localId < from && !this._peers.has(from)) this._connectTo(from, true);
			return;
		}
		let peer = this._peers.get(from);
		if (!peer) peer = this._connectTo(from, false);
		try {
			if (sig.kind === "offer") {
				await peer.pc.setRemoteDescription({
					type: "offer",
					sdp: sig.sdp
				});
				const answer = await peer.pc.createAnswer();
				await peer.pc.setLocalDescription(answer);
				this._send({
					type: "voice",
					to: from,
					signal: {
						kind: "answer",
						sdp: answer.sdp ?? ""
					}
				});
			} else if (sig.kind === "answer") await peer.pc.setRemoteDescription({
				type: "answer",
				sdp: sig.sdp
			});
			else if (sig.kind === "ice") await peer.pc.addIceCandidate(sig.candidate).catch(() => void 0);
		} catch (err) {
			this._reportError(err, from);
		}
	}
	_connectTo(peerId, asOfferer) {
		let entry = this._peers.get(peerId);
		if (entry) return entry;
		const pc = new RTCPeerConnection({ iceServers: this._opts.iceServers });
		entry = {
			pc,
			isOfferer: asOfferer
		};
		this._peers.set(peerId, entry);
		if (this._localStream) for (const t of this._localStream.getTracks()) pc.addTrack(t, this._localStream);
		else pc.addTransceiver("audio", { direction: "recvonly" });
		pc.addEventListener("icecandidate", (ev) => {
			if (ev.candidate) this._send({
				type: "voice",
				to: peerId,
				signal: {
					kind: "ice",
					candidate: ev.candidate.toJSON()
				}
			});
		});
		pc.addEventListener("track", (ev) => {
			const stream = ev.streams[0] ?? new MediaStream([ev.track]);
			entry.inbound = stream;
			for (const h of this._onTrack) h(peerId, stream);
			ev.track.addEventListener("ended", () => {
				for (const h of this._onTrackRemoved) h(peerId);
			});
			ev.track.addEventListener("mute", () => {
				for (const h of this._onTrackRemoved) h(peerId);
			});
			ev.track.addEventListener("unmute", () => {
				for (const h of this._onTrack) h(peerId, stream);
			});
		});
		pc.addEventListener("connectionstatechange", () => {
			if (pc.connectionState === "failed" || pc.connectionState === "closed") {
				if (pc.connectionState === "failed") this._reportError(/* @__PURE__ */ new Error("Peer audio connection failed. Network or NAT restrictions may require TURN."), peerId);
				this._teardown(peerId);
			}
		});
		if (asOfferer) this._makeOffer(peerId, entry);
		return entry;
	}
	async _makeOffer(peerId, entry) {
		try {
			const offer = await entry.pc.createOffer();
			await entry.pc.setLocalDescription(offer);
			this._send({
				type: "voice",
				to: peerId,
				signal: {
					kind: "offer",
					sdp: offer.sdp ?? ""
				}
			});
		} catch (err) {
			this._reportError(err, peerId);
		}
	}
	_reportError(cause, peerId) {
		const error = cause instanceof Error ? cause : new Error(String(cause));
		console.error("[netblocks/voice]", error);
		this._opts.onError(error, peerId);
	}
	_teardown(peerId) {
		const entry = this._peers.get(peerId);
		if (!entry) return;
		try {
			entry.pc.close();
		} catch {}
		this._peers.delete(peerId);
		for (const h of this._onTrackRemoved) h(peerId);
	}
};
//#endregion
export { VoiceChat };
