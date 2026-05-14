import { base64ToBytes, bytesToBase64 } from '../codec/PoseCodec.js';
import { makeId } from '../utils/IdUtils.js';
import { Transport } from './Transport.js';
import 'three';

/**
 * WebSocketTransport: connects to a small relay server (see
 * `src/addons/netblocks/server/relay.js`) that fans out messages to other
 * peers in the same room.
 *
 * Wire protocol (between client and relay):
 *
 * ```text
 * Client → Server:
 *   {type: 'join',  roomId, peerId}                 first frame after connect
 *   {type: 'send',  to?: peerId, data: base64}      forward to one/all peers
 *
 * Server → Client:
 *   {type: 'welcome', peerId, peers: string[]}      assigned id + current room
 *   {type: 'peer-join',  peerId}
 *   {type: 'peer-leave', peerId}
 *   {type: 'message', from: peerId, data: base64}
 * ```
 *
 * The relay keeps the protocol intentionally minimal — payloads are opaque
 * to it. See server/relay.js for the reference implementation.
 */
const RECONNECT_BASE_MS = 500;
class WebSocketTransport extends Transport {
    constructor(opts) {
        super();
        this.name = 'WebSocket';
        this._localPeerId = '';
        this._isOpen = false;
        this._peers = new Set();
        this._shouldReconnect = true;
        this._opts = opts;
        this._maxAttempts = opts.reconnectAttempts ?? 5;
        this._attemptsLeft = this._maxAttempts;
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
    connect(opts) {
        this._connectOpts = opts;
        this._localPeerId = opts.peerId ?? makeId();
        this._shouldReconnect = true;
        return this._open();
    }
    _open() {
        return new Promise((resolve, reject) => {
            const ws = new WebSocket(this._opts.url);
            this._ws = ws;
            let resolved = false;
            ws.addEventListener('open', () => {
                ws.send(JSON.stringify({
                    type: 'join',
                    roomId: this._connectOpts.roomId,
                    peerId: this._localPeerId,
                }));
            });
            ws.addEventListener('message', (ev) => {
                let msg;
                try {
                    msg =
                        typeof ev.data === 'string'
                            ? JSON.parse(ev.data)
                            : JSON.parse(new TextDecoder().decode(ev.data));
                }
                catch (err) {
                    this.emitError(err);
                    return;
                }
                switch (msg.type) {
                    case 'welcome':
                        this._isOpen = true;
                        if (msg.peerId)
                            this._localPeerId = msg.peerId;
                        this._attemptsLeft = this._maxAttempts;
                        for (const pid of msg.peers ?? []) {
                            if (pid !== this._localPeerId && !this._peers.has(pid)) {
                                this._peers.add(pid);
                                this.emitPeerJoin(pid);
                            }
                        }
                        this.dispatchEvent(new Event('open'));
                        if (!resolved) {
                            resolved = true;
                            resolve();
                        }
                        break;
                    case 'peer-join':
                        if (msg.peerId && !this._peers.has(msg.peerId)) {
                            this._peers.add(msg.peerId);
                            this.emitPeerJoin(msg.peerId);
                        }
                        break;
                    case 'peer-leave':
                        if (msg.peerId && this._peers.delete(msg.peerId)) {
                            this.emitPeerLeave(msg.peerId);
                        }
                        break;
                    case 'message':
                        if (msg.from && msg.data) {
                            this.emitMessage(msg.from, base64ToBytes(msg.data));
                        }
                        break;
                    case 'error':
                        this.emitError(new Error(msg.message ?? 'relay error'));
                        break;
                }
            });
            ws.addEventListener('error', (ev) => {
                this.emitError(new Error(`WebSocket error: ${ev.message ?? 'unknown'}`));
                if (!resolved) {
                    resolved = true;
                    reject(new Error('WebSocket failed to connect.'));
                }
            });
            ws.addEventListener('close', () => {
                const wasOpen = this._isOpen;
                this._isOpen = false;
                for (const id of this._peers)
                    this.emitPeerLeave(id);
                this._peers.clear();
                if (wasOpen)
                    this.dispatchEvent(new Event('close'));
                if (this._shouldReconnect && this._attemptsLeft > 0) {
                    // Exponential backoff anchored to the configured max so reconnects
                    // stay slow regardless of how many were configured. Previously the
                    // formula hardcoded the default (5), so e.g. reconnectAttempts: 20
                    // produced sub-millisecond retries.
                    const used = this._maxAttempts - this._attemptsLeft;
                    this._attemptsLeft -= 1;
                    const delay = RECONNECT_BASE_MS * Math.pow(2, used);
                    setTimeout(() => {
                        this._open().catch((err) => this.emitError(err));
                    }, delay);
                }
            });
        });
    }
    close() {
        this._shouldReconnect = false;
        this._ws?.close();
        this._ws = undefined;
        this._isOpen = false;
    }
    send(payload, targetPeerId) {
        if (!this._isOpen || !this._ws || this._ws.readyState !== WebSocket.OPEN)
            return;
        this._ws.send(JSON.stringify({
            type: 'send',
            to: targetPeerId,
            data: bytesToBase64(payload),
        }));
    }
}

export { WebSocketTransport };
