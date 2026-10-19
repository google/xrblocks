import { DEFAULT_ICE_SERVERS, DEFAULT_PEERJS_BROKER } from "../constants/NetConstants.js";
import { base64ToBytes } from "../codec/Base64.js";
import { makeId } from "../utils/IdUtils.js";
import { Transport } from "./Transport.js";
//#region src/addons/netblocks/src/core/transport/WebRTCTransport.ts
/**
* WebRTCTransport: peer-to-peer transport using a tiny manual signaling
* channel. By default it uses the public PeerJS broker for signaling
* (host: '0.peerjs.com'), so samples can run with no backend at all.
*
* Discovery model: PeerJS broker has no room/broadcast primitive — it only
* forwards messages to a specific destination peer id. To work around this,
* we use a deterministic *slot* scheme: each peer claims the lowest free
* slot id `xrbnet_<roomHash>_<slot>` (slot in 0..MAX_SLOTS-1) by attempting
* to register that id with the broker; if the broker responds with
* ID-TAKEN, we try the next slot. To discover other peers, we periodically
* send WebRTC OFFERs to every other slot id in the room. Slots that are
* occupied complete the handshake; empty slots time out and are reaped.
* To prevent SDP "glare", only the lex-greater peer id initiates.
*
* Caveats:
*   - The public broker is best-effort and rate-limited; do not rely on it
*     in production. Pass `signalingUrl` to use your own broker.
*   - Without TURN, NAT traversal can fail between certain network
*     topologies. Pass `iceServers` to add TURN servers if needed.
*   - Full-mesh topology and a fixed slot pool — best for ≤ MAX_SLOTS
*     participants per room.
*/
const ROOM_PREFIX = "xrbnet";
/**
* Max participants per room. Slot ids are deterministic so each peer can
* discover every other peer with a single OFFER per slot.
*/
const MAX_SLOTS = 12;
/** How often we re-probe still-unconnected slots (ms). */
const DISCOVERY_INTERVAL_MS = 4e3;
/** Cap for the discovery interval after backoff on idle ticks (ms). */
const DISCOVERY_MAX_INTERVAL_MS = 3e4;
/** Time after which a stalled OFFER is considered dead and the PC torn down. */
const HANDSHAKE_TIMEOUT_MS = 8e3;
/** PeerJS broker reaps WS connections that don't ping; must stay under 60s. */
const HEARTBEAT_INTERVAL_MS = 15e3;
const UNRELIABLE_MESSAGE_LIMIT_BYTES = 1200;
const UNRELIABLE_BUFFER_BUDGET_BYTES = 16384;
var WebRTCTransport = class extends Transport {
	get supportsUnreliable() {
		return this._opts.unreliableChannel === true;
	}
	constructor(opts = {}) {
		super();
		this.name = "WebRTC";
		this._localPeerId = "";
		this._roomId = "";
		this._isOpen = false;
		this._closed = false;
		this._pendingSockets = /* @__PURE__ */ new Set();
		this._probesInFlight = /* @__PURE__ */ new Set();
		this._peers = /* @__PURE__ */ new Set();
		this._entries = /* @__PURE__ */ new Map();
		this._discoveryIntervalMs = DISCOVERY_INTERVAL_MS;
		this._discoveryRequested = false;
		this._opts = opts;
	}
	get localPeerId() {
		return this._localPeerId;
	}
	get isOpen() {
		return this._isOpen;
	}
	/** Whether the broker socket is currently open, independently of data peers. */
	get isSignalingOpen() {
		return !this._closed && this._signaling !== void 0 && this._signaling.readyState === WebSocket.OPEN;
	}
	get remotePeerIds() {
		return this._peers;
	}
	async connect(opts) {
		if (this._closed) throw new Error("WebRTCTransport is closed.");
		if (this._isOpen) return;
		this._roomId = opts.roomId;
		const roomHash = this._hashRoom(opts.roomId);
		const broker = this._opts.signalingUrl ?? this._defaultBrokerUrl();
		let claimed = false;
		for (let slot = 0; slot < MAX_SLOTS; slot++) {
			const candidate = `${ROOM_PREFIX}_${roomHash}_${slot}`;
			try {
				await this._tryClaimSlot(broker, candidate);
				if (this._closed) throw new Error("WebRTCTransport connection cancelled.");
				this._localPeerId = candidate;
				claimed = true;
				break;
			} catch {
				if (this._closed) throw new Error("WebRTCTransport connection cancelled.");
			}
		}
		if (!claimed) {
			const msg = `WebRTCTransport: room "${opts.roomId}" is full (>${MAX_SLOTS} peers) or the signaling broker is unreachable.`;
			console.warn(`[netblocks/webrtc] ${msg}`);
			throw new Error(msg);
		}
		this._isOpen = true;
		this.dispatchEvent(new Event("open"));
		const tick = () => {
			if (!this._isOpen) return;
			const before = this._peers.size;
			this._discover(roomHash);
			const delayMs = this._discoveryIntervalMs;
			this._discoveryTimer = setTimeout(() => {
				if (!this._isOpen) return;
				if (this._peers.size === before) this._discoveryIntervalMs = Math.min(this._discoveryIntervalMs * 2, DISCOVERY_MAX_INTERVAL_MS);
				else this._discoveryIntervalMs = DISCOVERY_INTERVAL_MS;
				tick();
			}, delayMs);
		};
		tick();
		this._heartbeatTimer = setInterval(() => {
			if (this._signaling?.readyState === WebSocket.OPEN) try {
				this._signaling.send(JSON.stringify({ type: "HEARTBEAT" }));
			} catch {}
		}, HEARTBEAT_INTERVAL_MS);
	}
	/**
	* Explicitly reopen the broker registration without replacing live peer
	* connections or changing our peer ID. A taken slot rejects for caller retry.
	*/
	reconnectSignaling() {
		if (this._closed || !this._isOpen) return Promise.reject(/* @__PURE__ */ new Error("WebRTCTransport is not open."));
		if (this._signalingReconnect) return this._signalingReconnect;
		if (this.isSignalingOpen) return Promise.resolve();
		this._signalingReconnect = Promise.resolve().then(async () => {
			if (this._closed) return;
			if (this._signaling?.readyState !== WebSocket.OPEN) {
				await this._tryClaimSlot(this._opts.signalingUrl ?? this._defaultBrokerUrl(), this._localPeerId);
				if (this._closed) return;
				this._signaling?.send(JSON.stringify({ type: "HEARTBEAT" }));
				this._discover(this._hashRoom(this._roomId));
			}
		}).finally(() => {
			this._signalingReconnect = void 0;
		});
		return this._signalingReconnect;
	}
	/** Opt-in one-off room discovery, without changing the normal backoff timer. */
	discoverPeers() {
		if (this._closed || !this._isOpen || !this.isSignalingOpen || this._discoveryRequested) return;
		this._discoveryRequested = true;
		queueMicrotask(() => {
			this._discoveryRequested = false;
			if (!this._closed && this._isOpen && this.isSignalingOpen) this._discover(this._hashRoom(this._roomId));
		});
	}
	/** Locally close one peer, including a protected connection. Discovery remains caller-controlled. */
	dropPeer(peerId) {
		this._teardown(peerId);
	}
	close() {
		if (this._closed) return;
		this._closed = true;
		this._isOpen = false;
		this._probesInFlight.clear();
		for (const socket of this._pendingSockets) socket.close();
		this._pendingSockets.clear();
		if (this._discoveryTimer) clearTimeout(this._discoveryTimer);
		if (this._heartbeatTimer) clearInterval(this._heartbeatTimer);
		this._signaling?.close();
		this._signaling = void 0;
		for (const id of [...this._entries.keys()]) this._teardown(id);
		this.dispatchEvent(new Event("close"));
	}
	send(payload, targetPeerId) {
		if (targetPeerId) {
			this._sendTo(targetPeerId, payload);
			return;
		}
		for (const id of this._peers) this._sendTo(id, payload);
	}
	_sendTo(peerId, payload) {
		const entry = this._entries.get(peerId);
		if (!entry || !entry.dc || entry.dc.readyState !== "open") return;
		try {
			entry.dc.send(payload.buffer.slice(payload.byteOffset, payload.byteOffset + payload.byteLength));
		} catch (err) {
			this.emitError(err);
		}
	}
	/**
	* Queues a negotiated lossy message, at most 1,200 bytes and within the SCTP
	* limit and 16 KiB queued-byte budget. True means queued, not delivered.
	*/
	sendUnreliable(payload, targetPeerId) {
		const entry = this._entries.get(targetPeerId);
		const channel = entry?.unreliable;
		if (this._closed || !this.supportsUnreliable || !entry?.unreliableNegotiated || !channel || channel.readyState !== "open" || payload.byteLength > UNRELIABLE_MESSAGE_LIMIT_BYTES || channel.bufferedAmount + payload.byteLength > UNRELIABLE_BUFFER_BUDGET_BYTES) return false;
		const maximum = entry.pc.sctp?.maxMessageSize;
		if (maximum !== void 0 && (!(maximum >= 0) || maximum > 0 && payload.byteLength > maximum)) return false;
		try {
			channel.send(new Uint8Array(payload));
			return true;
		} catch {
			return false;
		}
	}
	_hashRoom(room) {
		let h = 5381;
		for (let i = 0; i < room.length; i++) h = (h << 5) + h + room.charCodeAt(i) | 0;
		return Math.abs(h).toString(36).slice(0, 6);
	}
	_defaultBrokerUrl() {
		const b = DEFAULT_PEERJS_BROKER;
		return `${b.secure ? "wss" : "ws"}://${b.host}:${b.port}${b.path}peerjs`;
	}
	_brokerUrlForId(base, id) {
		const key = this._opts.brokerKey ?? "peerjs";
		return `${base}${base.includes("?") ? "&" : "?"}key=${key}&id=${id}&token=${makeId(8)}&version=1.5.4`;
	}
	/**
	* Attempt to register `candidateId` with the broker. Resolves on `OPEN`,
	* rejects on `ID-TAKEN` or any other failure (caller will try the next slot).
	*/
	_tryClaimSlot(brokerBase, candidateId) {
		return new Promise((resolve, reject) => {
			const url = this._brokerUrlForId(brokerBase, candidateId);
			const ws = new WebSocket(url);
			this._pendingSockets.add(ws);
			let settled = false;
			const cleanup = () => {
				clearTimeout(timeout);
				this._pendingSockets.delete(ws);
				ws.removeEventListener("message", onMessage);
				ws.removeEventListener("error", onError);
				ws.removeEventListener("close", onClose);
			};
			const onMessage = (ev) => {
				let parsed = {};
				try {
					parsed = typeof ev.data === "string" ? JSON.parse(ev.data) : JSON.parse(new TextDecoder().decode(ev.data));
				} catch {
					return;
				}
				if (parsed.type === "OPEN") {
					settled = true;
					cleanup();
					this._signaling = ws;
					ws.addEventListener("message", (e) => this._handleSignal(e));
					ws.addEventListener("close", () => {
						if (this._isOpen && this._signaling === ws) this.emitError(/* @__PURE__ */ new Error("Signaling channel closed."));
					});
					resolve();
				} else if (parsed.type === "ID-TAKEN") {
					settled = true;
					cleanup();
					try {
						ws.close();
					} catch {}
					reject(/* @__PURE__ */ new Error("ID-TAKEN"));
				}
			};
			const onError = () => {
				if (settled) return;
				settled = true;
				cleanup();
				reject(/* @__PURE__ */ new Error("Signaling failed."));
			};
			const onClose = () => {
				if (settled) return;
				settled = true;
				cleanup();
				reject(/* @__PURE__ */ new Error("Signaling closed before OPEN."));
			};
			ws.addEventListener("message", onMessage);
			ws.addEventListener("error", onError);
			ws.addEventListener("close", onClose);
			const timeout = setTimeout(() => {
				if (settled) return;
				settled = true;
				cleanup();
				ws.close();
				reject(/* @__PURE__ */ new Error("Signaling timed out."));
			}, HANDSHAKE_TIMEOUT_MS);
		});
	}
	/**
	* Discover & connect to other peers. Two invariants protect us from the
	* PeerJS broker's behaviour of closing our signaling WS the moment we
	* forward a message to a non-existent `dst`:
	*
	*   1. Only HIGHER slots initiate to LOWER slots. By construction, if I
	*      claimed slot N, slots 0..N-1 were occupied at the moment I claimed
	*      (that's *why* N was the lowest free slot for me).
	*   2. For ongoing periodic discovery (peers may come and go), we
	*      probe-before-OFFER: open a transient WS for the candidate id; if
	*      the broker rejects with `ID-TAKEN` the slot is occupied so it's
	*      safe to OFFER, otherwise the slot is empty and we skip.
	*
	* Glare is impossible because only one side (higher slot) ever initiates.
	*/
	_discover(roomHash) {
		if (!this._isOpen) return;
		for (let slot = 0; slot < MAX_SLOTS; slot++) {
			const candidate = `${ROOM_PREFIX}_${roomHash}_${slot}`;
			if (candidate === this._localPeerId) continue;
			if (candidate >= this._localPeerId) continue;
			if (this._entries.has(candidate) || this._probesInFlight.has(candidate)) continue;
			this._probeAndOffer(candidate);
		}
	}
	/**
	* Open a short-lived probing WS to `candidateId`. If the broker rejects
	* with `ID-TAKEN`, the slot is currently held by another peer and it is
	* safe to send an OFFER from our long-lived signaling WS. If the broker
	* accepts (`OPEN`), the slot is free and we skip — sending an OFFER to a
	* non-existent `dst` would cause the broker to disconnect us.
	*/
	async _probeAndOffer(candidateId) {
		if (this._closed || this._entries.has(candidateId) || this._probesInFlight.has(candidateId)) return;
		this._probesInFlight.add(candidateId);
		try {
			const broker = this._opts.signalingUrl ?? this._defaultBrokerUrl();
			const url = this._brokerUrlForId(broker, candidateId);
			if (!await new Promise((resolve) => {
				const ws = new WebSocket(url);
				this._pendingSockets.add(ws);
				let settled = false;
				const finish = (taken) => {
					if (settled) return;
					settled = true;
					clearTimeout(timeout);
					this._pendingSockets.delete(ws);
					try {
						ws.close();
					} catch {}
					resolve(taken);
				};
				ws.addEventListener("message", (ev) => {
					let parsed = {};
					try {
						parsed = typeof ev.data === "string" ? JSON.parse(ev.data) : JSON.parse(new TextDecoder().decode(ev.data));
					} catch {
						return;
					}
					if (parsed.type === "ID-TAKEN") finish(true);
					else if (parsed.type === "OPEN") finish(false);
				});
				ws.addEventListener("error", () => finish(false));
				ws.addEventListener("close", () => finish(false));
				const timeout = setTimeout(() => finish(false), 3e3);
			}) || this._closed) return;
			if (this._entries.has(candidateId)) return;
			this._initiate(candidateId).catch((error) => {
				if (!this._closed) this.emitError(error);
			});
		} catch (error) {
			if (!this._closed) this.emitError(error);
		} finally {
			this._probesInFlight.delete(candidateId);
		}
	}
	_send(obj) {
		const sock = this._signaling;
		if (!sock || sock.readyState !== WebSocket.OPEN) return;
		try {
			sock.send(JSON.stringify(obj));
		} catch (err) {
			this.emitError(err);
		}
	}
	async _handleSignal(ev) {
		let msg;
		try {
			msg = typeof ev.data === "string" ? JSON.parse(ev.data) : JSON.parse(new TextDecoder().decode(ev.data));
		} catch {
			return;
		}
		if (!msg || !msg.type) return;
		const src = msg.src;
		if (src && [
			"LEAVE",
			"OFFER",
			"ANSWER",
			"CANDIDATE"
		].includes(msg.type) && this._protectsOpenPeer(src)) return;
		switch (msg.type) {
			case "OPEN":
			case "HEARTBEAT": break;
			case "EXPIRE":
				if (msg.dst && !this._protectsOpenPeer(msg.dst)) this._teardown(msg.dst);
				break;
			case "OFFER":
				if (this._opts.protectOpenPeers && (!src || !this._isRoomPeer(src))) return;
				if (src && msg.payload?.sdp) await this._handleOffer(src, msg.payload.sdp, hasUnreliableCapability(msg.payload.metadata));
				break;
			case "ANSWER":
				if (src && msg.payload?.sdp) await this._handleAnswer(src, msg.payload.sdp, hasUnreliableCapability(msg.payload.metadata));
				break;
			case "CANDIDATE":
				if (src && msg.payload?.candidate) await this._handleCandidate(src, msg.payload.candidate);
				break;
			case "LEAVE": if (src) this._teardown(src);
		}
	}
	_ensureEntry(remote) {
		let entry = this._entries.get(remote);
		if (entry) return entry;
		const pc = new RTCPeerConnection({ iceServers: this._opts.iceServers ?? DEFAULT_ICE_SERVERS });
		entry = {
			pc,
			ready: false,
			pendingIce: [],
			localUnreliable: this.supportsUnreliable,
			unreliableNegotiated: false,
			unreliableAttempted: false,
			initiator: false,
			remoteDescriptionReceived: false
		};
		entry.handshakeTimer = setTimeout(() => {
			if (!entry.ready) this._teardown(remote, entry);
		}, HANDSHAKE_TIMEOUT_MS);
		this._entries.set(remote, entry);
		pc.addEventListener("icecandidate", (ev) => {
			if (ev.candidate && this._entries.get(remote) === entry) this._send({
				type: "CANDIDATE",
				dst: remote,
				payload: {
					candidate: ev.candidate.toJSON(),
					type: "data",
					connectionId: this._connectionId(remote)
				}
			});
		});
		pc.addEventListener("connectionstatechange", () => {
			if (pc.connectionState === "failed" || pc.connectionState === "closed") this._teardown(remote, entry);
		});
		pc.addEventListener("datachannel", (ev) => {
			if (this._entries.get(remote) !== entry) closeChannel(ev.channel);
			else this._attachChannel(remote, ev.channel);
		});
		return entry;
	}
	_protectsOpenPeer(remote) {
		const entry = this._entries.get(remote);
		return this._opts.protectOpenPeers === true && !!entry && (entry.ready || entry.dc?.readyState === "open");
	}
	_isRoomPeer(remote) {
		if (!this._isOpen || remote === this._localPeerId) return false;
		const prefix = `${ROOM_PREFIX}_${this._hashRoom(this._roomId)}_`;
		for (let slot = 0; slot < MAX_SLOTS; slot++) if (remote === `${prefix}${slot}`) return true;
		return false;
	}
	_attachChannel(remote, dc, locallyCreated = false) {
		const entry = this._entries.get(remote);
		if (!entry || this._closed) {
			closeChannel(dc);
			return;
		}
		if (dc.label === "netblocks-unreliable") {
			if (!this.supportsUnreliable || !entry.unreliableNegotiated || locallyCreated !== entry.initiator || dc.ordered !== false || dc.maxRetransmits !== 0 || entry.unreliable && entry.unreliable !== dc) {
				closeChannel(dc);
				return;
			}
			if (entry.unreliable === dc) return;
			entry.unreliable = dc;
			dc.binaryType = "arraybuffer";
			dc.addEventListener("message", (event) => {
				if (this.supportsUnreliable && this._entries.get(remote) === entry && entry.unreliableNegotiated && entry.unreliable === dc && event.data instanceof ArrayBuffer && event.data.byteLength <= UNRELIABLE_MESSAGE_LIMIT_BYTES) this.emitMessage(remote, new Uint8Array(event.data), "unreliable");
			});
			dc.addEventListener("close", () => {
				if (entry.unreliable === dc) entry.unreliable = void 0;
			});
			return;
		}
		if (dc.label !== "netblocks" || locallyCreated !== entry.initiator || dc.ordered !== true || dc.maxRetransmits !== null || dc.maxPacketLifeTime !== null || entry.dc && entry.dc !== dc) {
			closeChannel(dc);
			return;
		}
		if (entry.dc === dc) return;
		entry.dc = dc;
		dc.binaryType = "arraybuffer";
		dc.addEventListener("open", () => {
			if (this._entries.get(remote) !== entry || this._closed) return;
			entry.ready = true;
			if (entry.handshakeTimer) {
				clearTimeout(entry.handshakeTimer);
				entry.handshakeTimer = void 0;
			}
			this._createUnreliableChannel(remote, entry);
			if (!this._peers.has(remote)) {
				this._peers.add(remote);
				this._discoveryIntervalMs = DISCOVERY_INTERVAL_MS;
				if (this._peers.size === 11) console.warn(`[netblocks/webrtc] room "${this._roomId}" has hit the ${MAX_SLOTS}-peer mesh cap; further joiners will fail to claim a slot. For larger rooms use a relay transport (WebSocketTransport) instead.`);
				this.emitPeerJoin(remote);
			}
		});
		dc.addEventListener("close", () => this._teardown(remote, entry));
		dc.addEventListener("message", (ev) => {
			if (this._entries.get(remote) !== entry || this._closed) return;
			const data = ev.data;
			let bytes;
			if (data instanceof ArrayBuffer) bytes = new Uint8Array(data);
			else if (data instanceof Uint8Array) bytes = data;
			else if (typeof data === "string") bytes = base64ToBytes(data);
			else return;
			this.emitMessage(remote, bytes);
		});
	}
	async _initiate(remote) {
		const entry = this._ensureEntry(remote);
		if (entry.dc) return;
		entry.initiator = true;
		try {
			const dc = entry.pc.createDataChannel("netblocks", { ordered: true });
			this._attachChannel(remote, dc, true);
			const offer = await entry.pc.createOffer();
			if (this._closed || this._entries.get(remote) !== entry) return;
			await entry.pc.setLocalDescription(offer);
			if (this._closed || this._entries.get(remote) !== entry) return;
			this._send({
				type: "OFFER",
				dst: remote,
				payload: {
					sdp: {
						type: "offer",
						sdp: offer.sdp ?? ""
					},
					type: "data",
					connectionId: this._connectionId(remote),
					label: "netblocks",
					reliable: true,
					serialization: "binary",
					metadata: { netblocks: { unreliableChannel: entry.localUnreliable ? 1 : 0 } },
					browser: "chrome"
				}
			});
		} catch (err) {
			if (this._closed || this._entries.get(remote) !== entry) return;
			this.emitError(err);
			this._teardown(remote, entry);
		}
	}
	async _handleOffer(remote, desc, remoteUnreliable) {
		if (!desc?.sdp || this._closed) return;
		let entry = this._ensureEntry(remote);
		if (entry.initiator || entry.offerSdp === desc.sdp) return;
		if (entry.offerSdp !== void 0) {
			this._teardown(remote, entry);
			if (this._closed) return;
			entry = this._ensureEntry(remote);
		}
		entry.offerSdp = desc.sdp;
		entry.remoteDescriptionReceived = true;
		try {
			await entry.pc.setRemoteDescription({
				type: "offer",
				sdp: desc.sdp
			});
			if (this._closed || this._entries.get(remote) !== entry) return;
			for (const c of entry.pendingIce) try {
				await entry.pc.addIceCandidate(c);
			} catch {}
			entry.pendingIce = [];
			if (this._closed || this._entries.get(remote) !== entry) return;
			const answer = await entry.pc.createAnswer();
			if (this._closed || this._entries.get(remote) !== entry) return;
			await entry.pc.setLocalDescription(answer);
			if (this._closed || this._entries.get(remote) !== entry) return;
			const accepted = entry.localUnreliable && this.supportsUnreliable && remoteUnreliable;
			this._send({
				type: "ANSWER",
				dst: remote,
				payload: {
					sdp: {
						type: "answer",
						sdp: answer.sdp ?? ""
					},
					type: "data",
					connectionId: this._connectionId(remote),
					metadata: { netblocks: { unreliableChannel: accepted ? 1 : 0 } }
				}
			});
			entry.unreliableNegotiated = accepted;
		} catch (err) {
			if (this._closed || this._entries.get(remote) !== entry) return;
			this.emitError(err);
			this._teardown(remote, entry);
		}
	}
	async _handleAnswer(remote, desc, remoteUnreliable) {
		if (!desc?.sdp) return;
		const entry = this._entries.get(remote);
		if (!entry || !entry.initiator || entry.remoteDescriptionReceived || this._closed) return;
		entry.remoteDescriptionReceived = true;
		try {
			await entry.pc.setRemoteDescription({
				type: "answer",
				sdp: desc.sdp
			});
			for (const c of entry.pendingIce) try {
				await entry.pc.addIceCandidate(c);
			} catch {}
			entry.pendingIce = [];
			if (this._closed || this._entries.get(remote) !== entry) return;
			entry.unreliableNegotiated = entry.localUnreliable && this.supportsUnreliable && remoteUnreliable;
			this._createUnreliableChannel(remote, entry);
		} catch (err) {
			if (this._closed || this._entries.get(remote) !== entry) return;
			this.emitError(err);
			this._teardown(remote, entry);
		}
	}
	/** Only the offerer creates the optional lane, after the answer and SCTP open. */
	_createUnreliableChannel(remote, entry) {
		if (this._closed || this._entries.get(remote) !== entry || !entry.initiator || !entry.unreliableNegotiated || !this.supportsUnreliable || entry.unreliableAttempted || entry.unreliable || entry.dc?.readyState !== "open") return;
		entry.unreliableAttempted = true;
		let channel;
		try {
			channel = entry.pc.createDataChannel("netblocks-unreliable", {
				ordered: false,
				maxRetransmits: 0
			});
			this._attachChannel(remote, channel, true);
		} catch {
			entry.unreliableNegotiated = false;
			if (entry.unreliable === channel) entry.unreliable = void 0;
			closeChannel(channel);
		}
	}
	/** Deterministic connection id per peer pair (sorted, broker requires it). */
	_connectionId(remote) {
		const [a, b] = this._localPeerId < remote ? [this._localPeerId, remote] : [remote, this._localPeerId];
		return `dc_${a}_${b}`;
	}
	async _handleCandidate(remote, candidate) {
		if (!candidate) return;
		const entry = this._entries.get(remote);
		if (!entry) return;
		if (!entry.pc.remoteDescription) {
			entry.pendingIce.push(candidate);
			return;
		}
		try {
			await entry.pc.addIceCandidate(candidate);
		} catch (err) {
			if (this._closed || this._entries.get(remote) !== entry) return;
			this.emitError(err);
		}
	}
	_teardown(remote, expected) {
		const entry = this._entries.get(remote);
		if (!entry || expected && entry !== expected) return;
		this._entries.delete(remote);
		if (entry.handshakeTimer) clearTimeout(entry.handshakeTimer);
		try {
			entry.dc?.close();
			entry.unreliable?.close();
			entry.pc.close();
		} catch {}
		if (this._peers.delete(remote)) this.emitPeerLeave(remote);
	}
};
function hasUnreliableCapability(metadata) {
	if (!metadata || typeof metadata !== "object" || !Object.hasOwn(metadata, "netblocks")) return false;
	const capabilities = metadata.netblocks;
	return !!capabilities && typeof capabilities === "object" && Object.hasOwn(capabilities, "unreliableChannel") && capabilities.unreliableChannel === 1;
}
function closeChannel(channel) {
	try {
		channel?.close();
	} catch {}
}
//#endregion
export { WebRTCTransport };
