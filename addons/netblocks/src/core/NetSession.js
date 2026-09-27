import "./constants/NetConstants.js";
import { decodeMessage, encodeMessage } from "./codec/MessageCodec.js";
import { base64ToBytes, decodePose } from "./codec/PoseCodec.js";
import { NetObject } from "./objects/NetObject.js";
import { NetObjectRegistry } from "./objects/NetObjectRegistry.js";
import { NetUser } from "./NetUser.js";
import { PresenceBroadcaster } from "./presence/PresenceBroadcaster.js";
import { NetEvents } from "./rpc/NetEvents.js";
import { SpatialVoice } from "./voice/SpatialVoice.js";
import { VoiceChat } from "./voice/VoiceChat.js";
import * as xb from "xrblocks";
//#region src/addons/netblocks/src/core/NetSession.ts
const DEFAULT_CAPABILITIES = {
	pose: true,
	voice: true,
	netobject: true
};
var NetSession = class extends EventTarget {
	constructor(transport, root, opts = {}) {
		super();
		this.netObjects = new NetObjectRegistry();
		this._users = /* @__PURE__ */ new Map();
		this._pendingJoinTimers = /* @__PURE__ */ new Map();
		this._playbackMuted = false;
		this._mutedPlaybackPeers = /* @__PURE__ */ new Set();
		this._isOpen = false;
		this._lastUpdateMs = 0;
		this._capabilities = { ...DEFAULT_CAPABILITIES };
		this._onPageHide = () => {
			if (this._isOpen) this.close();
		};
		this.transport = transport;
		this._root = root;
		this._opts = {
			presenceHz: opts.presenceHz ?? 20,
			netObjectHz: opts.netObjectHz ?? 20,
			netObjectInterpRate: opts.netObjectInterpRate ?? 12,
			voice: opts.voice ?? false,
			displayName: opts.displayName,
			role: opts.role ?? "user"
		};
		this.presence = new PresenceBroadcaster((msg) => this._sendNet(msg), this._opts.presenceHz);
		this.events = new NetEvents((msg) => this._sendNet(msg));
		const publishVoiceState = (on) => {
			this.events.emit("netblocks/voice-state", on);
			this.dispatchEvent(new CustomEvent("local-voice-state", { detail: { on } }));
		};
		this.voice = new VoiceChat((msg) => this._sendNet(msg), {
			onLocalStateChange: publishVoiceState,
			onLocalMuteChange: (muted) => publishVoiceState(!muted),
			onError: (error, peerId) => {
				this.dispatchEvent(new CustomEvent("voice-error", { detail: {
					error,
					peerId
				} }));
			}
		});
		this.voice.onTrack((peerId, stream) => this._onVoiceTrack(peerId, stream));
		this.voice.onTrackRemoved((peerId) => this._onVoiceTrackRemoved(peerId));
		this.events.on("netblocks/voice-state", (on, fromPeerId) => {
			const user = this._users.get(fromPeerId);
			if (user) {
				user.avatar.voiceActive = !!on;
				this.dispatchEvent(new CustomEvent("peer-voice-state", { detail: {
					peerId: fromPeerId,
					on: !!on
				} }));
			}
		});
		this.addEventListener("user-join", (e) => {
			if (!this.voice.isEnabled()) return;
			const peerId = e.detail.user.peerId;
			this.events.emitTo(peerId, "netblocks/voice-state", !this.voice.isMuted());
		});
		this.transport.addEventListener("peer-join", this._onTransportPeerJoin = (e) => this._onPeerJoin(e.detail.peerId));
		this.transport.addEventListener("peer-leave", this._onTransportPeerLeave = (e) => this._onPeerLeave(e.detail.peerId));
		this.transport.addEventListener("message", this._onTransportMessage = (e) => this._onMessage(e.detail));
	}
	get isOpen() {
		return this._isOpen;
	}
	get localPeerId() {
		return this.transport.localPeerId;
	}
	/** Local display name, as supplied via `NetSessionOptions.displayName`. */
	get displayName() {
		return this._opts.displayName;
	}
	/** Local self-reported role. Defaults to `'user'`. */
	get role() {
		return this._opts.role;
	}
	get users() {
		return this._users;
	}
	/** Whether all incoming voice is muted for this local listener. */
	get playbackMuted() {
		return this._playbackMuted;
	}
	/**
	* Mute incoming voice only, retaining each peer's individual choice.
	* May be set before open(); never changes the microphone or scene sounds.
	* Emits `playback-state` only when this preference changes.
	*/
	setPlaybackMuted(muted) {
		if (typeof muted !== "boolean") throw new TypeError("muted must be a boolean");
		if (this._playbackMuted === muted) return;
		this._playbackMuted = muted;
		for (const peerId of this._users.keys()) this._spatialVoice?.setPlaybackMuted(peerId, muted || this._mutedPlaybackPeers.has(peerId));
		this.dispatchEvent(new CustomEvent("playback-state", { detail: { muted } }));
	}
	/**
	* Mute a current peer's incoming voice for this listener only.
	* Retained across stream replacement/removal, cleared on peer leave/close.
	* Emits `playback-state` only when this individual preference changes.
	*
	* @throws TypeError for a non-boolean mute or an empty/non-string peer ID.
	* @throws RangeError if the peer is not in `users`.
	*/
	setPeerPlaybackMuted(peerId, muted) {
		this._validatePlaybackPeerId(peerId);
		if (typeof muted !== "boolean") throw new TypeError("muted must be a boolean");
		if (!this._users.has(peerId)) throw new RangeError(`Unknown playback peer: ${peerId}`);
		if (this._mutedPlaybackPeers.has(peerId) === muted) return;
		if (muted) this._mutedPlaybackPeers.add(peerId);
		else this._mutedPlaybackPeers.delete(peerId);
		this._spatialVoice?.setPlaybackMuted(peerId, this._playbackMuted || muted);
		this.dispatchEvent(new CustomEvent("playback-state", { detail: {
			peerId,
			muted
		} }));
	}
	/** Individual choice, unaffected by master mute; false for departed peers. */
	isPeerPlaybackMuted(peerId) {
		this._validatePlaybackPeerId(peerId);
		return this._mutedPlaybackPeers.has(peerId);
	}
	_validatePlaybackPeerId(peerId) {
		if (typeof peerId !== "string" || !peerId.trim()) throw new TypeError("peerId must be a non-empty string");
	}
	/** Connect the underlying transport and announce ourselves. */
	async open(roomId) {
		await this.transport.connect({ roomId });
		this._isOpen = true;
		this.voice.setLocalPeerId(this.transport.localPeerId);
		if (typeof window !== "undefined") window.addEventListener("pagehide", this._onPageHide);
		const listener = xb.core?.sound?.listener;
		if (listener && !this._spatialVoice) this._spatialVoice = new SpatialVoice(listener);
		const hello = {
			type: "hello",
			protocol: 1,
			displayName: this._opts.displayName,
			role: this._opts.role,
			capabilities: this._capabilities
		};
		this._sendNet(hello);
		if (this._opts.voice) try {
			await this.voice.enable(this.transport.remotePeerIds);
		} catch (err) {
			console.warn("[netblocks] voice.enable() failed:", err);
		}
		this.dispatchEvent(new Event("open"));
	}
	close() {
		this._spatialVoice?.dispose();
		this._spatialVoice = void 0;
		this._playbackMuted = false;
		this._mutedPlaybackPeers.clear();
		if (!this._isOpen) return;
		this._isOpen = false;
		if (typeof window !== "undefined") window.removeEventListener("pagehide", this._onPageHide);
		this.voice.disable();
		this._sendNet({ type: "bye" });
		this.transport.close();
		this.transport.removeEventListener("peer-join", this._onTransportPeerJoin);
		this.transport.removeEventListener("peer-leave", this._onTransportPeerLeave);
		this.transport.removeEventListener("message", this._onTransportMessage);
		for (const t of this._pendingJoinTimers.values()) clearTimeout(t);
		this._pendingJoinTimers.clear();
		for (const [, user] of this._users) {
			this.netObjects.releaseOwnedBy(user.peerId);
			user.dispose();
		}
		this._users.clear();
		this.dispatchEvent(new Event("close"));
	}
	/** Register an existing NetObject so its transform is replicated. */
	addNetObject(obj) {
		if (!obj.ownerId) obj.ownerId = this.localPeerId;
		this.netObjects.add(obj);
	}
	/** Convenience: create + auto-add a NetObject parented to `root`. */
	createNetObject(opts) {
		const obj = new NetObject(opts);
		obj.ownerId = obj.ownerId || this.localPeerId;
		this.netObjects.add(obj);
		this._root.add(obj);
		return obj;
	}
	removeNetObject(obj) {
		this.netObjects.remove(obj);
		obj.parent?.remove(obj);
	}
	/** Claim ownership of an object (e.g., on grab). */
	claim(obj) {
		const claimCounter = (obj.claim?.counter ?? 0) + 1;
		if (this.netObjects.applyClaim(obj.netId, this.localPeerId, claimCounter)) this._sendNet({
			type: "netobject.claim",
			id: obj.netId,
			claimCounter
		});
	}
	/** Release ownership of an object (e.g., on release). */
	release(obj) {
		const claimCounter = obj.claim?.counter;
		if (this.netObjects.applyRelease(obj.netId, this.localPeerId, claimCounter)) this._sendNet({
			type: "netobject.release",
			id: obj.netId,
			claimCounter,
			xform: obj.toXform(),
			state: Object.keys(obj.state).length ? obj.state : void 0
		});
	}
	/** Per-frame tick. Call from the host xb.Script's `update()`. */
	update(_time, _frame) {
		if (!this._isOpen) return;
		const now = performance.now();
		const dt = this._lastUpdateMs ? Math.min(.1, (now - this._lastUpdateMs) / 1e3) : 0;
		this._lastUpdateMs = now;
		this.presence.update(now);
		const renderTime = now - 100;
		for (const [, user] of this._users) user.avatar.applyPose(renderTime);
		const period = 1e3 / this._opts.netObjectHz;
		for (const obj of this.netObjects.values()) if (obj.ownerId === this.localPeerId) {
			if (now - obj._lastSendMs >= period) {
				obj._lastSendMs = now;
				obj._dirty = true;
				this._sendNet({
					type: "netobject",
					id: obj.netId,
					claimCounter: obj.claim?.counter,
					xform: obj.toXform(),
					state: Object.keys(obj.state).length ? obj.state : void 0
				});
			}
		} else if ((obj.ownerId || obj._pendingFinal) && obj._hasTarget) {
			const k = 1 - Math.exp(-this._opts.netObjectInterpRate * dt);
			obj.stepInterpolation(k);
		}
	}
	_sendNet(msg) {
		if (!this.transport.isOpen) return;
		msg.from = this.localPeerId;
		msg.ts = msg.ts ?? performance.now();
		const bytes = encodeMessage(msg);
		if (msg.to) this.transport.send(bytes, msg.to);
		else this.transport.send(bytes);
	}
	_onPeerJoin(peerId) {
		this._sendNet({
			type: "hello",
			protocol: 1,
			displayName: this._opts.displayName,
			role: this._opts.role,
			capabilities: this._capabilities,
			to: peerId
		});
		this.voice.notifyPeerJoined(peerId);
	}
	_onPeerLeave(peerId) {
		const pending = this._pendingJoinTimers.get(peerId);
		if (pending !== void 0) {
			clearTimeout(pending);
			this._pendingJoinTimers.delete(peerId);
		}
		this._mutedPlaybackPeers.delete(peerId);
		this._spatialVoice?.detach(peerId);
		const user = this._users.get(peerId);
		if (!user) return;
		this.netObjects.releaseOwnedBy(peerId);
		this.voice.notifyPeerLeft(peerId);
		user.dispose();
		this._users.delete(peerId);
		this.dispatchEvent(new CustomEvent("user-leave", { detail: { user } }));
	}
	_onMessage(detail) {
		if (!this._isOpen) return;
		let msg;
		try {
			msg = decodeMessage(detail.data);
		} catch (err) {
			console.warn("[netblocks] failed to decode message:", err);
			return;
		}
		msg.from = detail.peerId;
		if (msg.from === this.localPeerId) return;
		let user = this._users.get(msg.from);
		const existingUser = !!user;
		if (!user) {
			const initialDisplayName = msg.type === "hello" ? msg.displayName : void 0;
			const initialRole = msg.type === "hello" ? msg.role : void 0;
			const initialCapabilities = msg.type === "hello" ? msg.capabilities : { ...DEFAULT_CAPABILITIES };
			user = new NetUser(msg.from, initialCapabilities, initialDisplayName, initialRole);
			user.avatar.displayName = user.displayName;
			this._users.set(msg.from, user);
			this._root.add(user.avatar);
			if (msg.type === "hello") this.dispatchEvent(new CustomEvent("user-join", { detail: { user } }));
			else {
				const peerId = msg.from;
				const dispatchUser = user;
				const timer = setTimeout(() => {
					if (this._pendingJoinTimers.delete(peerId)) this.dispatchEvent(new CustomEvent("user-join", { detail: { user: dispatchUser } }));
				}, 1500);
				this._pendingJoinTimers.set(peerId, timer);
			}
		}
		user.lastSeenMs = performance.now();
		switch (msg.type) {
			case "hello": {
				user.displayName = msg.displayName ?? user.displayName;
				if (msg.role) user.role = msg.role;
				user.capabilities = msg.capabilities;
				user.avatar.displayName = user.displayName;
				const pending = this._pendingJoinTimers.get(msg.from);
				if (pending !== void 0) {
					clearTimeout(pending);
					this._pendingJoinTimers.delete(msg.from);
					this.dispatchEvent(new CustomEvent("user-join", { detail: { user } }));
				} else if (existingUser) this.dispatchEvent(new CustomEvent("user-update", { detail: { user } }));
				this._sendNet({
					type: "welcome",
					to: msg.from,
					peers: [...this._users.values()].map((u) => ({
						id: u.peerId,
						displayName: u.displayName,
						role: u.role,
						capabilities: u.capabilities
					}))
				});
				const snapObjects = [];
				for (const obj of this.netObjects.values()) {
					if (obj.automaticSnapshots === false || !obj._dirty) continue;
					snapObjects.push({
						id: obj.netId,
						xform: obj.toXform(),
						ownerId: obj.ownerId,
						claim: obj.claim,
						state: Object.keys(obj.state).length ? obj.state : void 0
					});
				}
				if (snapObjects.length > 0) this._sendNet({
					type: "netobject.snapshot",
					to: msg.from,
					objects: snapObjects
				});
				break;
			}
			case "welcome":
				for (const p of msg.peers) {
					if (p.id === this.localPeerId) continue;
					let other = this._users.get(p.id);
					if (!other) {
						other = new NetUser(p.id, p.capabilities, p.displayName, p.role);
						this._users.set(p.id, other);
						this._root.add(other.avatar);
						this.dispatchEvent(new CustomEvent("user-join", { detail: { user: other } }));
					} else {
						other.displayName = p.displayName ?? other.displayName;
						if (p.role) other.role = p.role;
						other.capabilities = p.capabilities;
						other.avatar.displayName = other.displayName;
						if (!this._pendingJoinTimers.has(p.id)) this.dispatchEvent(new CustomEvent("user-update", { detail: { user: other } }));
					}
				}
				break;
			case "bye":
				this._onPeerLeave(msg.from);
				break;
			case "pose":
				try {
					const snap = decodePose(base64ToBytes(msg.data));
					user.avatar.pose.push(snap, performance.now());
				} catch (err) {
					console.warn("[netblocks] failed to decode pose:", err);
				}
				break;
			case "netobject": {
				const obj = this.netObjects.get(msg.id);
				if (!obj) break;
				if (msg.claimCounter !== void 0 && !this.netObjects.applyClaim(msg.id, msg.from, msg.claimCounter)) break;
				if (obj.ownerId === this.localPeerId && msg.from < this.localPeerId && !obj._dirty) obj.ownerId = msg.from;
				if (obj.ownerId !== this.localPeerId) {
					if (msg.from !== obj.ownerId) break;
					obj.setTargetXform(msg.xform);
					if (msg.state) Object.assign(obj.state, msg.state);
				}
				break;
			}
			case "netobject.claim":
				this.netObjects.applyClaim(msg.id, msg.from, msg.claimCounter);
				break;
			case "netobject.release":
				if (this.netObjects.applyRelease(msg.id, msg.from, msg.claimCounter)) {
					const obj = this.netObjects.get(msg.id);
					if (obj && msg.xform) {
						obj.setTargetXform(msg.xform);
						obj._pendingFinal = true;
					}
					if (obj && msg.state) Object.assign(obj.state, msg.state);
				}
				break;
			case "netobject.snapshot":
				for (const entry of msg.objects) {
					const obj = this.netObjects.get(entry.id);
					if (!obj || obj.automaticSnapshots === false) continue;
					if (obj.ownerId === this.localPeerId && obj._dirty) continue;
					if (!this.netObjects.applyOwnershipSnapshot(entry.id, entry.ownerId, entry.claim)) continue;
					obj.snapToXform(entry.xform);
					if (entry.state) Object.assign(obj.state, entry.state);
				}
				break;
			case "rpc":
				this.events._dispatch(msg);
				break;
			case "voice": this.voice.handleSignal(msg.from, msg);
		}
	}
	_onVoiceTrack(peerId, stream) {
		if (!this._isOpen) return;
		if (!this._spatialVoice) {
			const listener = xb.core?.sound?.listener;
			if (listener) this._spatialVoice = new SpatialVoice(listener);
		}
		const user = this._users.get(peerId);
		if (!this._spatialVoice || !user) return;
		this._spatialVoice.attach(peerId, user.avatar.headPivot, stream, this._playbackMuted || this._mutedPlaybackPeers.has(peerId));
		this.dispatchEvent(new CustomEvent("voice-state", { detail: {
			peerId,
			on: true
		} }));
	}
	_onVoiceTrackRemoved(peerId) {
		this._spatialVoice?.detach(peerId);
	}
};
//#endregion
export { NetSession };
