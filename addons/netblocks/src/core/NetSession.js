import * as xb from 'xrblocks';
import { encodeMessage, decodeMessage } from './codec/MessageCodec.js';
import { decodePose, base64ToBytes } from './codec/PoseCodec.js';
import { DEFAULT_NETOBJECT_INTERP_RATE, DEFAULT_NETOBJECT_HZ, DEFAULT_PRESENCE_HZ, NET_PROTOCOL_VERSION, PRESENCE_RENDER_DELAY_MS } from './constants/NetConstants.js';
import { NetObject } from './objects/NetObject.js';
import { NetObjectRegistry } from './objects/NetObjectRegistry.js';
import { NetUser } from './NetUser.js';
import { PresenceBroadcaster } from './presence/PresenceBroadcaster.js';
import { NetEvents } from './rpc/NetEvents.js';
import { SpatialVoice } from './voice/SpatialVoice.js';
import { VoiceChat } from './voice/VoiceChat.js';
import 'three';
import './utils/IdUtils.js';
import './presence/RemoteUserAvatar.js';
import './presence/InterpolatedPose.js';

const DEFAULT_CAPABILITIES = {
    pose: true,
    voice: true,
    netobject: true,
};
class NetSession extends EventTarget {
    constructor(transport, root, opts = {}) {
        super();
        this.netObjects = new NetObjectRegistry();
        this._users = new Map();
        /**
         * Tracks users we created from a non-hello first message. We defer
         * `user-join` until either their hello arrives (so the listener sees a
         * populated displayName) or a small grace window elapses.
         */
        this._pendingJoinTimers = new Map();
        this._isOpen = false;
        this._lastUpdateMs = 0;
        this._capabilities = { ...DEFAULT_CAPABILITIES };
        // Send a final `bye` over the data channel so remote peers tear
        // down their per-peer state immediately, instead of waiting for
        // WebRTC ICE to time out (~15-30s) before noticing we're gone.
        // Use `pagehide` rather than `beforeunload` because it also fires
        // when the tab is bfcached on iOS Safari.
        this._onPageHide = () => {
            if (this._isOpen)
                this.close();
        };
        this.transport = transport;
        this._root = root;
        this._opts = {
            presenceHz: opts.presenceHz ?? DEFAULT_PRESENCE_HZ,
            netObjectHz: opts.netObjectHz ?? DEFAULT_NETOBJECT_HZ,
            netObjectInterpRate: opts.netObjectInterpRate ?? DEFAULT_NETOBJECT_INTERP_RATE,
            voice: opts.voice ?? false,
            displayName: opts.displayName,
            role: opts.role ?? 'user',
        };
        this.presence = new PresenceBroadcaster((msg) => this._sendNet(msg), this._opts.presenceHz);
        this.events = new NetEvents((msg) => this._sendNet(msg));
        this.voice = new VoiceChat((msg) => this._sendNet(msg), {
            onLocalStateChange: (on) => {
                // Broadcast our intent so other peers can show a reliable "in
                // voice chat" affordance that doesn't depend on per-browser
                // WebRTC track event timing.
                this.events.emit('netblocks/voice-state', on);
                // Also surface the change as a local CustomEvent so UI state
                // (mic button label, status text) tracks the authoritative
                // VoiceChat state rather than an optimistic flag in the app.
                this.dispatchEvent(new CustomEvent('local-voice-state', { detail: { on } }));
            },
        });
        this.voice.onTrack((peerId, stream) => this._onVoiceTrack(peerId, stream));
        this.voice.onTrackRemoved((peerId) => this._onVoiceTrackRemoved(peerId));
        // Track remote voice state from the data-channel signal. WebRTC's
        // own track events fire inconsistently across browsers on mute, so
        // this app-level intent is the source of truth for "is this peer
        // currently in voice chat".
        this.events.on('netblocks/voice-state', (on, fromPeerId) => {
            const user = this._users.get(fromPeerId);
            if (user)
                user.avatar.voiceActive = !!on;
        });
        // When a new peer joins after we're already in voice, send them a
        // snapshot so they don't display us as muted.
        this.addEventListener('user-join', (e) => {
            if (!this.voice.isEnabled())
                return;
            const peerId = e.detail.user.peerId;
            this.events.emitTo(peerId, 'netblocks/voice-state', true);
        });
        this.transport.addEventListener('peer-join', (this._onTransportPeerJoin = (e) => this._onPeerJoin(e.detail.peerId)));
        this.transport.addEventListener('peer-leave', (this._onTransportPeerLeave = (e) => this._onPeerLeave(e.detail.peerId)));
        this.transport.addEventListener('message', (this._onTransportMessage = (e) => this._onMessage(e.detail)));
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
    /** Connect the underlying transport and announce ourselves. */
    async open(roomId) {
        await this.transport.connect({ roomId });
        this._isOpen = true;
        this.voice.setLocalPeerId(this.transport.localPeerId);
        // Send a final `bye` on tab close so remote peers tear down
        // immediately. Without this, WebRTC peers wait for ICE failure
        // (15-30s) before noticing we've gone — long enough that the
        // departed avatar reads as a "frozen ghost" in the room.
        if (typeof window !== 'undefined') {
            window.addEventListener('pagehide', this._onPageHide);
        }
        // Lazy-init spatial voice. Reuse CoreSound's THREE.AudioListener
        // (already attached to the camera) so we don't run two listeners /
        // two AudioContexts on the same camera.
        const listener = xb.core?.sound?.listener;
        if (listener && !this._spatialVoice) {
            this._spatialVoice = new SpatialVoice(listener);
        }
        // Greet every peer already known.
        const hello = {
            type: 'hello',
            protocol: NET_PROTOCOL_VERSION,
            displayName: this._opts.displayName,
            role: this._opts.role,
            capabilities: this._capabilities,
        };
        this._sendNet(hello);
        if (this._opts.voice) {
            try {
                await this.voice.enable(this.transport.remotePeerIds);
            }
            catch (err) {
                console.warn('[netblocks] voice.enable() failed:', err);
            }
        }
        this.dispatchEvent(new Event('open'));
    }
    close() {
        if (!this._isOpen)
            return;
        this._isOpen = false;
        if (typeof window !== 'undefined') {
            window.removeEventListener('pagehide', this._onPageHide);
        }
        // Voice first so the per-peer voice `bye` and the
        // `netblocks/voice-state=false` broadcast arrive at remote peers
        // BEFORE the session-level `bye`. Otherwise the session bye
        // removes the local user on each remote, and the later voice
        // messages — routed through `_onMessage` — would create a
        // brand-new ghost `NetUser` for the (now-departed) sender.
        this.voice.disable();
        this._sendNet({ type: 'bye' });
        this.transport.close();
        // Detach our transport listeners so the transport (which may outlive
        // the session — e.g., a sample that re-opens with a fresh session)
        // doesn't keep firing into a closed session.
        this.transport.removeEventListener('peer-join', this._onTransportPeerJoin);
        this.transport.removeEventListener('peer-leave', this._onTransportPeerLeave);
        this.transport.removeEventListener('message', this._onTransportMessage);
        for (const t of this._pendingJoinTimers.values())
            clearTimeout(t);
        this._pendingJoinTimers.clear();
        for (const [, user] of this._users) {
            this.netObjects.releaseOwnedBy(user.peerId);
            user.dispose();
        }
        this._users.clear();
        this.dispatchEvent(new Event('close'));
    }
    /** Register an existing NetObject so its transform is replicated. */
    addNetObject(obj) {
        if (!obj.ownerId)
            obj.ownerId = this.localPeerId;
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
        if (this.netObjects.applyClaim(obj.netId, this.localPeerId)) {
            this._sendNet({ type: 'netobject.claim', id: obj.netId });
        }
    }
    /** Release ownership of an object (e.g., on release). */
    release(obj) {
        if (this.netObjects.applyRelease(obj.netId, this.localPeerId)) {
            // Embed a final canonical xform inside the release so receivers can
            // snap on release in a single message. Sending xform separately first
            // wasn't enough — the receiver only lerps ~20% per frame, so by the
            // time the release arrived the object was still mid-interpolation.
            this._sendNet({
                type: 'netobject.release',
                id: obj.netId,
                xform: obj.toXform(),
                state: Object.keys(obj.state).length ? obj.state : undefined,
            });
        }
    }
    /** Per-frame tick. Call from the host xb.Script's `update()`. */
    update(_time, _frame) {
        if (!this._isOpen)
            return;
        const now = performance.now();
        // Frame-rate-independent dt for interpolation. Clamp to 100 ms so a
        // tab that was suspended (or our own first tick where _lastUpdateMs
        // is 0) doesn't produce a single huge step that snaps every remote
        // object across the room.
        const dt = this._lastUpdateMs
            ? Math.min(0.1, (now - this._lastUpdateMs) / 1000)
            : 0;
        this._lastUpdateMs = now;
        // Outbound presence.
        this.presence.update(now);
        // Smooth remote avatars. Sample slightly in the past so we always
        // interpolate between two received snapshots that bracket render time
        // (instead of extrapolating from the most recent one alone).
        const renderTime = now - PRESENCE_RENDER_DELAY_MS;
        for (const [, user] of this._users) {
            user.avatar.applyPose(renderTime);
        }
        // Replicated objects.
        const period = 1000 / this._opts.netObjectHz;
        for (const obj of this.netObjects.values()) {
            if (obj.ownerId === this.localPeerId) {
                if (now - obj._lastSendMs >= period) {
                    obj._lastSendMs = now;
                    obj._dirty = true;
                    this._sendNet({
                        type: 'netobject',
                        id: obj.netId,
                        xform: obj.toXform(),
                        state: Object.keys(obj.state).length ? obj.state : undefined,
                    });
                }
            }
            else if ((obj.ownerId || obj._pendingFinal) && obj._hasTarget) {
                // Interpolate while a remote peer owns the object, OR while we're
                // settling onto a final post-release pose. The render-delay buffer
                // means we'd otherwise see the unrendered tail of motion as a
                // visible snap-forward at let-go.
                // Frame-rate-independent exponential convergence: at any dt, the
                // fraction of remaining distance covered is `1 - exp(-rate*dt)`.
                // The legacy fixed 0.2/frame at 60 fps corresponds to rate ~12.
                const k = 1 - Math.exp(-this._opts.netObjectInterpRate * dt);
                obj.stepInterpolation(k);
            }
        }
    }
    // -----------------------------------------------------------------------
    // Internal: send / dispatch / lifecycle
    // -----------------------------------------------------------------------
    _sendNet(msg) {
        if (!this.transport.isOpen)
            return;
        msg.from = this.localPeerId;
        msg.ts = msg.ts ?? performance.now();
        const bytes = encodeMessage(msg);
        if (msg.to) {
            this.transport.send(bytes, msg.to);
        }
        else {
            this.transport.send(bytes);
        }
    }
    _onPeerJoin(peerId) {
        // We defer creating a NetUser (and dispatching `user-join`) until the
        // first message arrives — typically a hello carrying their display name.
        // This keeps the public event clean: by the time a listener fires, the
        // user object has its display name and capabilities populated.
        // Re-introduce ourselves so the new peer learns our capabilities.
        this._sendNet({
            type: 'hello',
            protocol: NET_PROTOCOL_VERSION,
            displayName: this._opts.displayName,
            role: this._opts.role,
            capabilities: this._capabilities,
            to: peerId,
        });
        this.voice.notifyPeerJoined(peerId);
    }
    _onPeerLeave(peerId) {
        const pending = this._pendingJoinTimers.get(peerId);
        if (pending !== undefined) {
            clearTimeout(pending);
            this._pendingJoinTimers.delete(peerId);
        }
        const user = this._users.get(peerId);
        if (!user)
            return;
        this.netObjects.releaseOwnedBy(peerId);
        this.voice.notifyPeerLeft(peerId);
        this._spatialVoice?.detach(peerId);
        user.dispose();
        this._users.delete(peerId);
        this.dispatchEvent(new CustomEvent('user-leave', { detail: { user } }));
    }
    _onMessage(detail) {
        // Drop messages that arrive after close() — some transports buffer
        // events that hadn't been flushed yet, and dispatching user-join /
        // applying state into a closed session would surface as confusing
        // post-close events on the host app.
        if (!this._isOpen)
            return;
        let msg;
        try {
            msg = decodeMessage(detail.data);
        }
        catch (err) {
            console.warn('[netblocks] failed to decode message:', err);
            return;
        }
        // Trust the transport-attested peer id, never the body. The transport
        // knows which datachannel/connection a message came in on; the `from`
        // field on the wire is convenience metadata that a malicious peer
        // could otherwise set to anything (impersonating, claiming objects,
        // sending bye to kick others, etc).
        msg.from = detail.peerId;
        if (msg.from === this.localPeerId)
            return; // ignore loopback
        let user = this._users.get(msg.from);
        if (!user) {
            const initialDisplayName = msg.type === 'hello' ? msg.displayName : undefined;
            const initialRole = msg.type === 'hello' ? msg.role : undefined;
            const initialCapabilities = msg.type === 'hello' ? msg.capabilities : { ...DEFAULT_CAPABILITIES };
            user = new NetUser(msg.from, initialCapabilities, initialDisplayName, initialRole);
            user.avatar.displayName = user.displayName;
            this._users.set(msg.from, user);
            this._root.add(user.avatar);
            if (msg.type === 'hello') {
                this.dispatchEvent(new CustomEvent('user-join', { detail: { user } }));
            }
            else {
                // Defer dispatch: a hello is almost certainly already in flight from
                // the remote's `_onPeerJoin` handler. Wait briefly so listeners see a
                // populated displayName. If it never arrives, dispatch anyway.
                const peerId = msg.from;
                const dispatchUser = user;
                const timer = setTimeout(() => {
                    if (this._pendingJoinTimers.delete(peerId)) {
                        this.dispatchEvent(new CustomEvent('user-join', {
                            detail: { user: dispatchUser },
                        }));
                    }
                }, 1500);
                this._pendingJoinTimers.set(peerId, timer);
            }
        }
        user.lastSeenMs = performance.now();
        switch (msg.type) {
            case 'hello': {
                user.displayName = msg.displayName ?? user.displayName;
                if (msg.role)
                    user.role = msg.role;
                user.capabilities = msg.capabilities;
                user.avatar.displayName = user.displayName;
                // Flush any deferred user-join now that we have the displayName.
                const pending = this._pendingJoinTimers.get(msg.from);
                if (pending !== undefined) {
                    clearTimeout(pending);
                    this._pendingJoinTimers.delete(msg.from);
                    this.dispatchEvent(new CustomEvent('user-join', { detail: { user } }));
                }
                // Reply with a welcome containing the rooms's known peer list.
                this._sendNet({
                    type: 'welcome',
                    to: msg.from,
                    peers: [...this._users.values()].map((u) => ({
                        id: u.peerId,
                        displayName: u.displayName,
                        role: u.role,
                        capabilities: u.capabilities,
                    })),
                });
                // Catch the new peer up on any replicated objects we know about.
                // Without this, objects that no peer currently owns (or that the
                // joiner happens to own at the same id but with stale defaults)
                // would stay at their constructor positions on the joiner until
                // somebody claims them again. We only include `_dirty` objects —
                // pristine constructor copies have nothing useful to share, and
                // echoing them back would clobber the joiner's own (or the other
                // peer's) authoritative state with defaults.
                const snapObjects = [];
                for (const obj of this.netObjects.values()) {
                    if (!obj._dirty)
                        continue;
                    snapObjects.push({
                        id: obj.netId,
                        xform: obj.toXform(),
                        ownerId: obj.ownerId,
                        state: Object.keys(obj.state).length ? obj.state : undefined,
                    });
                }
                if (snapObjects.length > 0) {
                    this._sendNet({
                        type: 'netobject.snapshot',
                        to: msg.from,
                        objects: snapObjects,
                    });
                }
                break;
            }
            case 'welcome':
                for (const p of msg.peers) {
                    if (p.id === this.localPeerId)
                        continue;
                    let other = this._users.get(p.id);
                    if (!other) {
                        other = new NetUser(p.id, p.capabilities, p.displayName, p.role);
                        this._users.set(p.id, other);
                        this._root.add(other.avatar);
                        this.dispatchEvent(new CustomEvent('user-join', {
                            detail: { user: other },
                        }));
                    }
                    else {
                        other.displayName = p.displayName ?? other.displayName;
                        if (p.role)
                            other.role = p.role;
                        other.capabilities = p.capabilities;
                        other.avatar.displayName = other.displayName;
                    }
                }
                break;
            case 'bye':
                this._onPeerLeave(msg.from);
                break;
            case 'pose':
                try {
                    const snap = decodePose(base64ToBytes(msg.data));
                    // Stamp with receive-time, not sender ts. Sender and receiver
                    // performance.now() origins are independent (per-tab), so using
                    // msg.ts would mix two unrelated clocks and degenerate the
                    // interpolation factor toward 1 (snap-to-latest), producing
                    // visible chop even on the same machine.
                    user.avatar.pose.push(snap, performance.now());
                }
                catch (err) {
                    console.warn('[netblocks] failed to decode pose:', err);
                }
                break;
            case 'netobject': {
                const obj = this.netObjects.get(msg.id);
                if (!obj)
                    break;
                // If we both think we own it (e.g., both peers auto-owned the same
                // deterministic id at create-time), the lex-smaller peer id wins —
                // matches the explicit-claim tiebreak in NetObjectRegistry. But
                // never yield a copy we've actually been moving (`_dirty`) to a
                // silent peer broadcasting defaults: that's the late-join race
                // where a fresh joiner's first ticks would otherwise clobber the
                // existing peer's authoritative state.
                if (obj.ownerId === this.localPeerId &&
                    msg.from < this.localPeerId &&
                    !obj._dirty) {
                    obj.ownerId = msg.from;
                }
                if (obj.ownerId !== this.localPeerId) {
                    // Only accept xform updates from the current owner. Any other
                    // sender is necessarily stale (in-flight from a previous owner
                    // whose release/claim has since been processed). We also reject
                    // when nobody owns the object — a `netobject` with no owner
                    // can only be a leftover from before a release, and applying
                    // it would revive `_hasTarget` and undo the post-release final
                    // we're settling onto.
                    if (msg.from !== obj.ownerId) {
                        break;
                    }
                    obj.setTargetXform(msg.xform);
                    if (msg.state)
                        Object.assign(obj.state, msg.state);
                }
                break;
            }
            case 'netobject.claim':
                this.netObjects.applyClaim(msg.id, msg.from);
                break;
            case 'netobject.release': {
                if (this.netObjects.applyRelease(msg.id, msg.from)) {
                    const obj = this.netObjects.get(msg.id);
                    if (obj && msg.xform) {
                        // Don't snap. We render ~100ms behind the owner's real-time
                        // motion, so a hard snap to the final pose at let-go shows
                        // up as a visible jump-forward of the unrendered tail. Set
                        // it as a target and let the interp loop finish under the
                        // `_pendingFinal` gate.
                        obj.setTargetXform(msg.xform);
                        obj._pendingFinal = true;
                    }
                    if (obj && msg.state)
                        Object.assign(obj.state, msg.state);
                }
                break;
            }
            case 'netobject.snapshot': {
                // Late-join catch-up. Apply each entry, but don't clobber objects
                // we've actually been moving — our `_dirty` copy is canonical and
                // the remote snapshot of it is by definition stale. A pristine
                // auto-owned copy (created at construction but never moved) DOES
                // accept the snapshot, otherwise the joiner would discard the
                // existing peer's state and stay at constructor defaults.
                for (const entry of msg.objects) {
                    const obj = this.netObjects.get(entry.id);
                    if (!obj)
                        continue;
                    if (obj.ownerId === this.localPeerId && obj._dirty)
                        continue;
                    obj.snapToXform(entry.xform);
                    obj.ownerId = entry.ownerId;
                    if (entry.state) {
                        Object.assign(obj.state, entry.state);
                    }
                }
                break;
            }
            case 'rpc':
                this.events._dispatch(msg);
                break;
            case 'voice':
                void this.voice.handleSignal(msg.from, msg);
                break;
        }
    }
    _onVoiceTrack(peerId, stream) {
        if (!this._spatialVoice) {
            const listener = xb.core?.sound?.listener;
            if (listener)
                this._spatialVoice = new SpatialVoice(listener);
        }
        const user = this._users.get(peerId);
        if (!this._spatialVoice || !user)
            return;
        this._spatialVoice.attach(peerId, user.avatar.headPivot, stream);
        this.dispatchEvent(new CustomEvent('voice-state', { detail: { peerId, on: true } }));
    }
    _onVoiceTrackRemoved(peerId) {
        this._spatialVoice?.detach(peerId);
    }
}

export { NetSession };
