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
import {base64ToBytes} from '../codec/Base64';
import {
  DEFAULT_ICE_SERVERS,
  DEFAULT_PEERJS_BROKER,
} from '../constants/NetConstants';
import {makeId} from '../utils/IdUtils';
import {
  Transport,
  TransportConnectOptions,
  TransportPayload,
} from './Transport';

export interface WebRTCTransportOptions {
  /** Override the default PeerJS broker URL. If not supplied, the public broker is used. */
  signalingUrl?: string;
  /** ICE servers (STUN/TURN). Defaults to Google's public STUN. */
  iceServers?: RTCIceServer[];
  /** Optional broker key (PeerJS uses 'peerjs' for the public host). */
  brokerKey?: string;
  /** Opt in to a separate unordered, zero-retransmission lane, negotiated with each peer. */
  unreliableChannel?: boolean;
}

interface PeerEntry {
  pc: RTCPeerConnection;
  dc?: RTCDataChannel;
  unreliable?: RTCDataChannel;
  localUnreliable: boolean;
  unreliableNegotiated: boolean;
  unreliableAttempted: boolean;
  initiator: boolean;
  remoteDescriptionReceived: boolean;
  offerSdp?: string;
  ready: boolean;
  pendingIce: RTCIceCandidateInit[];
  handshakeTimer?: ReturnType<typeof setTimeout>;
}

const ROOM_PREFIX = 'xrbnet';
/**
 * Max participants per room. Slot ids are deterministic so each peer can
 * discover every other peer with a single OFFER per slot.
 */
const MAX_SLOTS = 12;
/** How often we re-probe still-unconnected slots (ms). */
const DISCOVERY_INTERVAL_MS = 4000;
/** Cap for the discovery interval after backoff on idle ticks (ms). */
const DISCOVERY_MAX_INTERVAL_MS = 30000;
/** Time after which a stalled OFFER is considered dead and the PC torn down. */
const HANDSHAKE_TIMEOUT_MS = 8000;
/** PeerJS broker reaps WS connections that don't ping; must stay under 60s. */
const HEARTBEAT_INTERVAL_MS = 15000;
// Keep latency-sensitive messages small enough to avoid large SCTP fragments.
const UNRELIABLE_MESSAGE_LIMIT_BYTES = 1200;
const UNRELIABLE_BUFFER_BUDGET_BYTES = 16 * 1024;

export class WebRTCTransport extends Transport {
  readonly name = 'WebRTC';
  get supportsUnreliable(): boolean {
    return this._opts.unreliableChannel === true;
  }
  private _signaling?: WebSocket;
  private _localPeerId = '';
  private _roomId = '';
  private _isOpen = false;
  private _closed = false;
  private _pendingSockets = new Set<WebSocket>();
  private _opts: WebRTCTransportOptions;
  private _peers = new Set<string>();
  private _entries = new Map<string, PeerEntry>();
  private _discoveryTimer?: ReturnType<typeof setTimeout>;
  private _discoveryIntervalMs = DISCOVERY_INTERVAL_MS;
  private _heartbeatTimer?: ReturnType<typeof setInterval>;
  constructor(opts: WebRTCTransportOptions = {}) {
    super();
    this._opts = opts;
  }

  get localPeerId(): string {
    return this._localPeerId;
  }
  get isOpen(): boolean {
    return this._isOpen;
  }
  get remotePeerIds(): ReadonlySet<string> {
    return this._peers;
  }

  async connect(opts: TransportConnectOptions): Promise<void> {
    if (this._closed) throw new Error('WebRTCTransport is closed.');
    if (this._isOpen) return;
    this._roomId = opts.roomId;
    const roomHash = this._hashRoom(opts.roomId);

    // Claim the lowest free slot id by trying each in turn against the broker.
    // PeerJS broker rejects taken ids with `ID-TAKEN` and closes the WS.
    const broker = this._opts.signalingUrl ?? this._defaultBrokerUrl();
    let claimed = false;
    for (let slot = 0; slot < MAX_SLOTS; slot++) {
      const candidate = `${ROOM_PREFIX}_${roomHash}_${slot}`;
      try {
        await this._tryClaimSlot(broker, candidate);
        if (this._closed)
          throw new Error('WebRTCTransport connection cancelled.');
        this._localPeerId = candidate;
        claimed = true;
        break;
      } catch {
        if (this._closed)
          throw new Error('WebRTCTransport connection cancelled.');
        // ID-TAKEN or transient failure; try next slot.
      }
    }
    if (!claimed) {
      const msg =
        `WebRTCTransport: room "${opts.roomId}" is full ` +
        `(>${MAX_SLOTS} peers) or the signaling broker is unreachable.`;
      console.warn(`[netblocks/webrtc] ${msg}`);
      throw new Error(msg);
    }

    this._isOpen = true;
    this.dispatchEvent(new Event('open'));

    // Periodically OFFER to every other slot id; occupied slots respond,
    // empty slots time out and are reaped by `_handshakeTimeout`.
    // Schedules itself with backoff so an idle room doesn't hammer the
    // broker (and trip per-IP rate limits like Cloudflare's WAF).
    const tick = () => {
      if (!this._isOpen) return;
      const before = this._peers.size;
      this._discover(roomHash);
      // Settle a beat so any in-flight probes that find a peer can
      // resolve before we decide whether to back off. The probe has its
      // own 3s cap so peer count converges quickly.
      const delayMs = this._discoveryIntervalMs;
      this._discoveryTimer = setTimeout(() => {
        if (!this._isOpen) return;
        if (this._peers.size === before) {
          this._discoveryIntervalMs = Math.min(
            this._discoveryIntervalMs * 2,
            DISCOVERY_MAX_INTERVAL_MS
          );
        } else {
          this._discoveryIntervalMs = DISCOVERY_INTERVAL_MS;
        }
        tick();
      }, delayMs);
    };
    tick();

    // PeerJS broker disconnects clients that don't send periodic heartbeats.
    // Without this our long-lived signaling WS dies after ~30s, freeing our
    // slot id and allowing other peers to also claim slot 0 → no discovery.
    this._heartbeatTimer = setInterval(() => {
      if (this._signaling?.readyState === WebSocket.OPEN) {
        try {
          this._signaling.send(JSON.stringify({type: 'HEARTBEAT'}));
        } catch {
          // ignore
        }
      }
    }, HEARTBEAT_INTERVAL_MS);
  }

  close(): void {
    if (this._closed) return;
    this._closed = true;
    this._isOpen = false;
    for (const socket of this._pendingSockets) socket.close();
    this._pendingSockets.clear();
    if (this._discoveryTimer) clearTimeout(this._discoveryTimer);
    if (this._heartbeatTimer) clearInterval(this._heartbeatTimer);
    this._signaling?.close();
    this._signaling = undefined;
    for (const id of [...this._entries.keys()]) this._teardown(id);
    this.dispatchEvent(new Event('close'));
  }

  send(payload: TransportPayload, targetPeerId?: string): void {
    if (targetPeerId) {
      this._sendTo(targetPeerId, payload);
      return;
    }
    for (const id of this._peers) this._sendTo(id, payload);
  }

  private _sendTo(peerId: string, payload: TransportPayload): void {
    const entry = this._entries.get(peerId);
    if (!entry || !entry.dc || entry.dc.readyState !== 'open') return;
    try {
      // RTCDataChannel.send overloads vary across TS DOM lib versions; pass
      // the buffer view through `any` to stay compatible without losing the
      // zero-copy fast path that Chrome offers for typed-array sends.
      (entry.dc.send as (data: ArrayBufferLike) => void)(
        payload.buffer.slice(
          payload.byteOffset,
          payload.byteOffset + payload.byteLength
        )
      );
    } catch (err) {
      this.emitError(err as Error);
    }
  }

  /**
   * Queues a negotiated lossy message, at most 1,200 bytes and within the SCTP
   * limit and 16 KiB queued-byte budget. True means queued, not delivered.
   */
  sendUnreliable(payload: TransportPayload, targetPeerId: string): boolean {
    const entry = this._entries.get(targetPeerId);
    const channel = entry?.unreliable;
    if (
      this._closed ||
      !this.supportsUnreliable ||
      !entry?.unreliableNegotiated ||
      !channel ||
      channel.readyState !== 'open' ||
      payload.byteLength > UNRELIABLE_MESSAGE_LIMIT_BYTES ||
      channel.bufferedAmount + payload.byteLength >
        UNRELIABLE_BUFFER_BUDGET_BYTES
    )
      return false;
    const maximum = entry.pc.sctp?.maxMessageSize;
    // Zero (or Infinity) represents an unbounded negotiated SCTP maximum.
    // Older implementations without the property still get the conservative cap.
    if (
      maximum !== undefined &&
      (!(maximum >= 0) || (maximum > 0 && payload.byteLength > maximum))
    )
      return false;
    try {
      channel.send(new Uint8Array(payload));
      return true;
    } catch {
      return false;
    }
  }

  private _hashRoom(room: string): string {
    let h = 5381;
    for (let i = 0; i < room.length; i++)
      h = ((h << 5) + h + room.charCodeAt(i)) | 0;
    return Math.abs(h).toString(36).slice(0, 6);
  }

  private _defaultBrokerUrl(): string {
    const b = DEFAULT_PEERJS_BROKER;
    const proto = b.secure ? 'wss' : 'ws';
    return `${proto}://${b.host}:${b.port}${b.path}peerjs`;
  }

  private _brokerUrlForId(base: string, id: string): string {
    const key = this._opts.brokerKey ?? 'peerjs';
    const sep = base.includes('?') ? '&' : '?';
    return `${base}${sep}key=${key}&id=${id}&token=${makeId(8)}&version=1.5.4`;
  }

  /**
   * Attempt to register `candidateId` with the broker. Resolves on `OPEN`,
   * rejects on `ID-TAKEN` or any other failure (caller will try the next slot).
   */
  private _tryClaimSlot(
    brokerBase: string,
    candidateId: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const url = this._brokerUrlForId(brokerBase, candidateId);
      const ws = new WebSocket(url);
      this._pendingSockets.add(ws);
      let settled = false;
      const cleanup = () => {
        clearTimeout(timeout);
        this._pendingSockets.delete(ws);
        ws.removeEventListener('message', onMessage);
        ws.removeEventListener('error', onError);
        ws.removeEventListener('close', onClose);
      };
      const onMessage = (ev: MessageEvent) => {
        let parsed: {type?: string} = {};
        try {
          parsed =
            typeof ev.data === 'string'
              ? JSON.parse(ev.data)
              : JSON.parse(new TextDecoder().decode(ev.data));
        } catch {
          return;
        }
        if (parsed.type === 'OPEN') {
          settled = true;
          cleanup();
          // Hand the open WS over to the long-lived signaling pipeline.
          this._signaling = ws;
          ws.addEventListener('message', (e) => this._handleSignal(e));
          ws.addEventListener('close', () => {
            if (this._isOpen)
              this.emitError(new Error('Signaling channel closed.'));
          });
          resolve();
        } else if (parsed.type === 'ID-TAKEN') {
          settled = true;
          cleanup();
          try {
            ws.close();
          } catch {
            // ignore
          }
          reject(new Error('ID-TAKEN'));
        }
      };
      const onError = () => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error('Signaling failed.'));
      };
      const onClose = () => {
        if (settled) return;
        settled = true;
        cleanup();
        reject(new Error('Signaling closed before OPEN.'));
      };
      ws.addEventListener('message', onMessage);
      ws.addEventListener('error', onError);
      ws.addEventListener('close', onClose);
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        cleanup();
        ws.close();
        reject(new Error('Signaling timed out.'));
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
  private _discover(roomHash: string): void {
    if (!this._isOpen) return;
    for (let slot = 0; slot < MAX_SLOTS; slot++) {
      const candidate = `${ROOM_PREFIX}_${roomHash}_${slot}`;
      if (candidate === this._localPeerId) continue;
      // Only initiate to slots strictly less than ours (see invariant).
      if (candidate >= this._localPeerId) continue;
      // Skip if we have any in-flight or open entry for this slot. Without
      // checking in-flight (not just ready) handshakes, a slow handshake
      // gets re-probed on the next tick and we end up with two PCs and
      // DataChannels per peer; the second silently orphans the first.
      // Stalled entries are reaped by the handshake timeout in _ensureEntry.
      if (this._entries.has(candidate)) continue;
      void this._probeAndOffer(candidate);
    }
  }

  /**
   * Open a short-lived probing WS to `candidateId`. If the broker rejects
   * with `ID-TAKEN`, the slot is currently held by another peer and it is
   * safe to send an OFFER from our long-lived signaling WS. If the broker
   * accepts (`OPEN`), the slot is free and we skip — sending an OFFER to a
   * non-existent `dst` would cause the broker to disconnect us.
   */
  private async _probeAndOffer(candidateId: string): Promise<void> {
    const broker = this._opts.signalingUrl ?? this._defaultBrokerUrl();
    const url = this._brokerUrlForId(broker, candidateId);
    const occupied: boolean = await new Promise((resolve) => {
      const ws = new WebSocket(url);
      this._pendingSockets.add(ws);
      let settled = false;
      const finish = (taken: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        this._pendingSockets.delete(ws);
        try {
          ws.close();
        } catch {
          // ignore
        }
        resolve(taken);
      };
      ws.addEventListener('message', (ev) => {
        let parsed: {type?: string} = {};
        try {
          parsed =
            typeof ev.data === 'string'
              ? JSON.parse(ev.data)
              : JSON.parse(new TextDecoder().decode(ev.data));
        } catch {
          return;
        }
        if (parsed.type === 'ID-TAKEN') finish(true);
        else if (parsed.type === 'OPEN') finish(false);
      });
      ws.addEventListener('error', () => finish(false));
      ws.addEventListener('close', () => finish(false));
      // Cap the probe lifetime so a hung connection can't stall discovery.
      const timeout = setTimeout(() => finish(false), 3000);
    });
    if (!occupied || this._closed) return;
    // Re-check we still don't have a live channel before initiating.
    const existing = this._entries.get(candidateId);
    if (existing && existing.dc?.readyState === 'open') return;
    void this._initiate(candidateId);
  }

  private _send(obj: object): void {
    const sock = this._signaling;
    if (!sock || sock.readyState !== WebSocket.OPEN) return;
    try {
      sock.send(JSON.stringify(obj));
    } catch (err) {
      this.emitError(err as Error);
    }
  }

  private async _handleSignal(ev: MessageEvent): Promise<void> {
    interface SignalMsg {
      type?: string;
      src?: string;
      dst?: string;
      payload?: {
        sdp?: RTCSessionDescriptionInit;
        candidate?: RTCIceCandidateInit;
        metadata?: unknown;
      };
    }
    let msg: SignalMsg;
    try {
      msg =
        typeof ev.data === 'string'
          ? JSON.parse(ev.data)
          : JSON.parse(new TextDecoder().decode(ev.data));
    } catch {
      return;
    }
    if (!msg || !msg.type) return;
    const src = msg.src;
    switch (msg.type) {
      case 'OPEN':
      case 'HEARTBEAT':
        break;
      case 'EXPIRE':
        // Broker couldn't deliver to dst. Reap the dead handshake.
        if (msg.dst) this._teardown(msg.dst);
        break;
      case 'OFFER':
        if (src && msg.payload?.sdp)
          await this._handleOffer(
            src,
            msg.payload.sdp,
            hasUnreliableCapability(msg.payload.metadata)
          );
        break;
      case 'ANSWER':
        if (src && msg.payload?.sdp)
          await this._handleAnswer(
            src,
            msg.payload.sdp,
            hasUnreliableCapability(msg.payload.metadata)
          );
        break;
      case 'CANDIDATE':
        if (src && msg.payload?.candidate)
          await this._handleCandidate(src, msg.payload.candidate);
        break;
      case 'LEAVE':
        if (src) this._teardown(src);
        break;
    }
  }

  private _ensureEntry(remote: string): PeerEntry {
    let entry = this._entries.get(remote);
    if (entry) return entry;
    const pc = new RTCPeerConnection({
      iceServers: this._opts.iceServers ?? DEFAULT_ICE_SERVERS,
    });
    entry = {
      pc,
      ready: false,
      pendingIce: [],
      localUnreliable: this.supportsUnreliable,
      unreliableNegotiated: false,
      unreliableAttempted: false,
      initiator: false,
      remoteDescriptionReceived: false,
    };
    // Reap stalled handshakes so empty slots don't leak RTCPeerConnections.
    entry.handshakeTimer = setTimeout(() => {
      if (!entry.ready) this._teardown(remote, entry);
    }, HANDSHAKE_TIMEOUT_MS);
    this._entries.set(remote, entry);

    pc.addEventListener('icecandidate', (ev) => {
      if (ev.candidate && this._entries.get(remote) === entry) {
        this._send({
          type: 'CANDIDATE',
          dst: remote,
          payload: {
            candidate: ev.candidate.toJSON(),
            type: 'data',
            connectionId: this._connectionId(remote),
          },
        });
      }
    });
    pc.addEventListener('connectionstatechange', () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
        this._teardown(remote, entry);
      }
    });
    pc.addEventListener('datachannel', (ev) => {
      if (this._entries.get(remote) !== entry) closeChannel(ev.channel);
      else this._attachChannel(remote, ev.channel);
    });
    return entry;
  }

  private _attachChannel(
    remote: string,
    dc: RTCDataChannel,
    locallyCreated = false
  ): void {
    const entry = this._entries.get(remote);
    if (!entry || this._closed) {
      closeChannel(dc);
      return;
    }
    if (dc.label === 'netblocks-unreliable') {
      if (
        !this.supportsUnreliable ||
        !entry.unreliableNegotiated ||
        locallyCreated !== entry.initiator ||
        dc.ordered !== false ||
        dc.maxRetransmits !== 0 ||
        (entry.unreliable && entry.unreliable !== dc)
      ) {
        closeChannel(dc);
        return;
      }
      if (entry.unreliable === dc) return;
      entry.unreliable = dc;
      dc.binaryType = 'arraybuffer';
      dc.addEventListener('message', (event) => {
        if (
          this.supportsUnreliable &&
          this._entries.get(remote) === entry &&
          entry.unreliableNegotiated &&
          entry.unreliable === dc &&
          event.data instanceof ArrayBuffer &&
          event.data.byteLength <= UNRELIABLE_MESSAGE_LIMIT_BYTES
        )
          this.emitMessage(remote, new Uint8Array(event.data), 'unreliable');
      });
      dc.addEventListener('close', () => {
        if (entry.unreliable === dc) entry.unreliable = undefined;
      });
      return;
    }
    if (
      dc.label !== 'netblocks' ||
      locallyCreated !== entry.initiator ||
      dc.ordered !== true ||
      dc.maxRetransmits !== null ||
      dc.maxPacketLifeTime !== null ||
      (entry.dc && entry.dc !== dc)
    ) {
      closeChannel(dc);
      return;
    }
    if (entry.dc === dc) return;
    entry.dc = dc;
    dc.binaryType = 'arraybuffer';
    dc.addEventListener('open', () => {
      if (this._entries.get(remote) !== entry || this._closed) return;
      entry.ready = true;
      if (entry.handshakeTimer) {
        clearTimeout(entry.handshakeTimer);
        entry.handshakeTimer = undefined;
      }
      this._createUnreliableChannel(remote, entry);
      if (!this._peers.has(remote)) {
        this._peers.add(remote);
        this._discoveryIntervalMs = DISCOVERY_INTERVAL_MS;
        // Warn once we approach the room cap. _peers excludes the local
        // peer, so size === MAX_SLOTS - 1 means every slot is full.
        if (this._peers.size === MAX_SLOTS - 1) {
          console.warn(
            `[netblocks/webrtc] room "${this._roomId}" has hit the ` +
              `${MAX_SLOTS}-peer mesh cap; further joiners will fail to ` +
              `claim a slot. For larger rooms use a relay transport ` +
              `(WebSocketTransport) instead.`
          );
        }
        this.emitPeerJoin(remote);
      }
    });
    dc.addEventListener('close', () => this._teardown(remote, entry));
    dc.addEventListener('message', (ev) => {
      if (this._entries.get(remote) !== entry || this._closed) return;
      const data = ev.data;
      let bytes: Uint8Array;
      if (data instanceof ArrayBuffer) bytes = new Uint8Array(data);
      else if (data instanceof Uint8Array) bytes = data;
      else if (typeof data === 'string') bytes = base64ToBytes(data);
      else return;
      this.emitMessage(remote, bytes);
    });
  }

  private async _initiate(remote: string): Promise<void> {
    const entry = this._ensureEntry(remote);
    if (entry.dc) return;
    entry.initiator = true;
    try {
      const dc = entry.pc.createDataChannel('netblocks', {ordered: true});
      this._attachChannel(remote, dc, true);
      const offer = await entry.pc.createOffer();
      if (this._closed || this._entries.get(remote) !== entry) return;
      await entry.pc.setLocalDescription(offer);
      if (this._closed || this._entries.get(remote) !== entry) return;
      this._send({
        type: 'OFFER',
        dst: remote,
        // Public PeerJS broker validates the OFFER payload shape and closes
        // the WS if `sdp` is not a serialized RTCSessionDescription, or if
        // `type`/`connectionId` are missing.
        payload: {
          sdp: {type: 'offer', sdp: offer.sdp ?? ''},
          type: 'data',
          connectionId: this._connectionId(remote),
          label: 'netblocks',
          reliable: true,
          serialization: 'binary',
          metadata: {
            netblocks: {unreliableChannel: entry.localUnreliable ? 1 : 0},
          },
          browser: 'chrome',
        },
      });
    } catch (err) {
      if (this._closed || this._entries.get(remote) !== entry) return;
      this.emitError(err as Error);
      this._teardown(remote, entry);
    }
  }

  private async _handleOffer(
    remote: string,
    desc: RTCSessionDescriptionInit,
    remoteUnreliable: boolean
  ): Promise<void> {
    if (!desc?.sdp || this._closed) return;
    let entry = this._ensureEntry(remote);
    if (entry.initiator || entry.offerSdp === desc.sdp) return;
    // A reload may reclaim its broker slot before the old SCTP connection
    // closes. Only identical offers are duplicates; a new SDP is a new peer
    // connection, with its own channels and capability negotiation.
    if (entry.offerSdp !== undefined) {
      this._teardown(remote, entry);
      if (this._closed) return;
      entry = this._ensureEntry(remote);
    }
    entry.offerSdp = desc.sdp;
    entry.remoteDescriptionReceived = true;
    try {
      await entry.pc.setRemoteDescription({type: 'offer', sdp: desc.sdp});
      if (this._closed || this._entries.get(remote) !== entry) return;
      for (const c of entry.pendingIce) {
        try {
          await entry.pc.addIceCandidate(c);
        } catch {
          // ignore
        }
      }
      entry.pendingIce = [];
      if (this._closed || this._entries.get(remote) !== entry) return;
      const answer = await entry.pc.createAnswer();
      if (this._closed || this._entries.get(remote) !== entry) return;
      await entry.pc.setLocalDescription(answer);
      if (this._closed || this._entries.get(remote) !== entry) return;
      const accepted =
        entry.localUnreliable && this.supportsUnreliable && remoteUnreliable;
      this._send({
        type: 'ANSWER',
        dst: remote,
        payload: {
          sdp: {type: 'answer', sdp: answer.sdp ?? ''},
          type: 'data',
          connectionId: this._connectionId(remote),
          metadata: {netblocks: {unreliableChannel: accepted ? 1 : 0}},
        },
      });
      entry.unreliableNegotiated = accepted;
    } catch (err) {
      if (this._closed || this._entries.get(remote) !== entry) return;
      this.emitError(err as Error);
      this._teardown(remote, entry);
    }
  }

  private async _handleAnswer(
    remote: string,
    desc: RTCSessionDescriptionInit,
    remoteUnreliable: boolean
  ): Promise<void> {
    if (!desc?.sdp) return;
    const entry = this._entries.get(remote);
    if (
      !entry ||
      !entry.initiator ||
      entry.remoteDescriptionReceived ||
      this._closed
    )
      return;
    entry.remoteDescriptionReceived = true;
    try {
      await entry.pc.setRemoteDescription({type: 'answer', sdp: desc.sdp});
      for (const c of entry.pendingIce) {
        try {
          await entry.pc.addIceCandidate(c);
        } catch {
          // ignore
        }
      }
      entry.pendingIce = [];
      if (this._closed || this._entries.get(remote) !== entry) return;
      entry.unreliableNegotiated =
        entry.localUnreliable && this.supportsUnreliable && remoteUnreliable;
      this._createUnreliableChannel(remote, entry);
    } catch (err) {
      if (this._closed || this._entries.get(remote) !== entry) return;
      this.emitError(err as Error);
      this._teardown(remote, entry);
    }
  }

  /** Only the offerer creates the optional lane, after the answer and SCTP open. */
  private _createUnreliableChannel(remote: string, entry: PeerEntry): void {
    if (
      this._closed ||
      this._entries.get(remote) !== entry ||
      !entry.initiator ||
      !entry.unreliableNegotiated ||
      !this.supportsUnreliable ||
      entry.unreliableAttempted ||
      entry.unreliable ||
      entry.dc?.readyState !== 'open'
    )
      return;
    entry.unreliableAttempted = true;
    let channel: RTCDataChannel | undefined;
    try {
      channel = entry.pc.createDataChannel('netblocks-unreliable', {
        ordered: false,
        maxRetransmits: 0,
      });
      this._attachChannel(remote, channel, true);
    } catch {
      // Optional-channel failure must not reach the reliable negotiation catch
      // blocks or emit a fatal transport error to existing room consumers.
      entry.unreliableNegotiated = false;
      if (entry.unreliable === channel) entry.unreliable = undefined;
      closeChannel(channel);
    }
  }

  /** Deterministic connection id per peer pair (sorted, broker requires it). */
  private _connectionId(remote: string): string {
    const [a, b] =
      this._localPeerId < remote
        ? [this._localPeerId, remote]
        : [remote, this._localPeerId];
    return `dc_${a}_${b}`;
  }

  private async _handleCandidate(
    remote: string,
    candidate?: RTCIceCandidateInit
  ): Promise<void> {
    if (!candidate) return;
    // Don't allocate a PC for a peer we never offered to / answered. Prevents
    // a hostile broker peer from forcing us to create RTCPeerConnections by
    // forging CANDIDATE messages with arbitrary `src`. Mirrors `_handleAnswer`.
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
      this.emitError(err as Error);
    }
  }

  private _teardown(remote: string, expected?: PeerEntry): void {
    const entry = this._entries.get(remote);
    if (!entry || (expected && entry !== expected)) return;
    this._entries.delete(remote);
    if (entry.handshakeTimer) clearTimeout(entry.handshakeTimer);
    try {
      entry.dc?.close();
      entry.unreliable?.close();
      entry.pc.close();
    } catch {
      // ignore
    }
    if (this._peers.delete(remote)) this.emitPeerLeave(remote);
  }
}

function hasUnreliableCapability(metadata: unknown): boolean {
  if (
    !metadata ||
    typeof metadata !== 'object' ||
    !Object.hasOwn(metadata, 'netblocks')
  )
    return false;
  const capabilities = (metadata as {netblocks?: unknown}).netblocks;
  return (
    !!capabilities &&
    typeof capabilities === 'object' &&
    Object.hasOwn(capabilities, 'unreliableChannel') &&
    (capabilities as {unreliableChannel?: unknown}).unreliableChannel === 1
  );
}

function closeChannel(channel?: RTCDataChannel): void {
  try {
    channel?.close();
  } catch {
    /* Rejection must not tear down the peer. */
  }
}
