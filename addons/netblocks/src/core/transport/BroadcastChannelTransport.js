import { makeId } from '../utils/IdUtils.js';
import { base64ToBytes, bytesToBase64 } from '../codec/PoseCodec.js';
import { Transport } from './Transport.js';
import 'three';

/**
 * BroadcastChannelTransport: a zero-config transport that connects browser
 * tabs / windows on the same origin via the BroadcastChannel API.
 *
 * Use this for local development and demos: open the same sample in two
 * tabs and you instantly see each other — no signaling server, no
 * NAT-traversal, no internet required.
 *
 * Because BroadcastChannel doesn't expose per-message sender info, every
 * frame is wrapped in a JSON envelope `{from, to?, payload(base64)}`. We
 * de-duplicate by ignoring our own id, and implement a tiny presence
 * protocol on top: each peer periodically broadcasts a `__hello__` and a
 * `__bye__` is sent on close (and on the `pagehide` lifecycle event).
 */
const HELLO_INTERVAL_MS = 1500;
const PEER_TIMEOUT_MS = 5000;
class BroadcastChannelTransport extends Transport {
    constructor() {
        super(...arguments);
        this.name = 'BroadcastChannel';
        this._localPeerId = '';
        this._isOpen = false;
        this._peers = new Set();
        this._peerSeenAt = new Map();
        this._pageHideHandler = () => this._sendBye();
        this._onChannelMessage = (ev) => {
            const env = ev.data;
            if (!env || env.v !== 1 || !env.from || env.from === this._localPeerId)
                return;
            if (env.to && env.to !== this._localPeerId)
                return;
            if (!this._peers.has(env.from)) {
                this._peers.add(env.from);
                this.emitPeerJoin(env.from);
                // Re-announce so the new peer learns about us promptly.
                this._sendEnvelope({ v: 1, from: this._localPeerId, kind: 'hello' });
            }
            this._peerSeenAt.set(env.from, performance.now());
            if (env.kind === 'bye') {
                this._removePeer(env.from);
                return;
            }
            if (env.kind === 'data' && env.d) {
                this.emitMessage(env.from, base64ToBytes(env.d));
            }
        };
    }
    get localPeerId() {
        return this._localPeerId;
    }
    get isOpen() {
        return this._isOpen;
    }
    get remotePeerIds() {
        return this._peers;
    }
    async connect(opts) {
        if (this._isOpen)
            return;
        if (typeof BroadcastChannel === 'undefined') {
            throw new Error('BroadcastChannel is not available in this environment. ' +
                'Use WebRTCTransport or WebSocketTransport instead.');
        }
        this._localPeerId = opts.peerId ?? makeId();
        this._channel = new BroadcastChannel(`xrblocks-netblocks::${opts.roomId}`);
        this._channel.addEventListener('message', this._onChannelMessage);
        this._isOpen = true;
        // Announce ourselves and start the keep-alive ticker.
        this._sendEnvelope({ v: 1, from: this._localPeerId, kind: 'hello' });
        this._helloTimer = setInterval(() => {
            this._sendEnvelope({ v: 1, from: this._localPeerId, kind: 'hello' });
        }, HELLO_INTERVAL_MS);
        this._gcTimer = setInterval(() => this._gcPeers(), HELLO_INTERVAL_MS);
        if (typeof window !== 'undefined') {
            window.addEventListener('pagehide', this._pageHideHandler);
        }
        this.dispatchEvent(new Event('open'));
    }
    close() {
        if (!this._isOpen)
            return;
        this._isOpen = false;
        this._sendBye();
        if (this._helloTimer)
            clearInterval(this._helloTimer);
        if (this._gcTimer)
            clearInterval(this._gcTimer);
        if (typeof window !== 'undefined') {
            window.removeEventListener('pagehide', this._pageHideHandler);
        }
        this._channel?.removeEventListener('message', this._onChannelMessage);
        this._channel?.close();
        this._channel = undefined;
        for (const id of this._peers)
            this.emitPeerLeave(id);
        this._peers.clear();
        this._peerSeenAt.clear();
        this.dispatchEvent(new Event('close'));
    }
    send(payload, targetPeerId) {
        if (!this._isOpen || !this._channel)
            return;
        this._sendEnvelope({
            v: 1,
            from: this._localPeerId,
            to: targetPeerId,
            kind: 'data',
            d: bytesToBase64(payload),
        });
    }
    _sendBye() {
        if (!this._channel)
            return;
        this._sendEnvelope({ v: 1, from: this._localPeerId, kind: 'bye' });
    }
    _sendEnvelope(env) {
        try {
            this._channel?.postMessage(env);
        }
        catch (err) {
            this.emitError(err);
        }
    }
    _gcPeers() {
        const now = performance.now();
        for (const [id, seen] of this._peerSeenAt) {
            if (now - seen > PEER_TIMEOUT_MS)
                this._removePeer(id);
        }
    }
    _removePeer(peerId) {
        if (!this._peers.delete(peerId))
            return;
        this._peerSeenAt.delete(peerId);
        this.emitPeerLeave(peerId);
    }
}

export { BroadcastChannelTransport };
