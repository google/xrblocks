import { DEFAULT_ICE_SERVERS } from '../constants/NetConstants.js';

class VoiceChat {
    constructor(send, opts = {}) {
        this._onTrack = new Set();
        this._onTrackRemoved = new Set();
        this._peers = new Map();
        this._enabled = false;
        this._localId = '';
        // Incremented on every disable(). enable() captures the current
        // value at the start of its async getUserMedia await; if the value
        // has advanced by the time the await resolves, a disable arrived
        // mid-request and the mic stream we just acquired is stale — stop
        // it and bail without flipping `_enabled` true.
        this._generation = 0;
        this._send = send;
        this._opts = {
            iceServers: opts.iceServers ?? DEFAULT_ICE_SERVERS,
            audioConstraints: opts.audioConstraints ?? {
                echoCancellation: true,
                noiseSuppression: true,
            },
            onLocalStateChange: opts.onLocalStateChange ?? (() => { }),
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
    /** Request mic + start negotiating with all currently-connected peers. */
    async enable(currentPeers) {
        if (this._enabled)
            return;
        if (typeof navigator === 'undefined' ||
            !navigator.mediaDevices?.getUserMedia) {
            throw new Error('VoiceChat: getUserMedia is not available.');
        }
        // Snapshot the generation BEFORE the await. If disable() runs
        // while getUserMedia is pending, it bumps _generation. We then
        // throw away the freshly-acquired stream so we never leak a live
        // mic and never flip `_enabled` true behind the disabler's back.
        const gen = this._generation;
        const stream = await navigator.mediaDevices.getUserMedia({
            audio: this._opts.audioConstraints,
        });
        if (gen !== this._generation) {
            for (const t of stream.getTracks())
                t.stop();
            return;
        }
        this._localStream = stream;
        this._enabled = true;
        this._opts.onLocalStateChange(true);
        // Back-fill local tracks onto any peer connections that were created
        // earlier as answerers (remote enabled voice before us). Without this
        // those PCs would carry only the inbound audio, never our outbound.
        for (const [pid, entry] of this._peers) {
            if (entry.pc.getSenders().some((s) => s.track?.kind === 'audio')) {
                continue;
            }
            for (const t of this._localStream.getTracks()) {
                entry.pc.addTrack(t, this._localStream);
            }
            // Re-offer so the remote learns about our newly added track.
            void this._makeOffer(pid, entry);
        }
        for (const pid of currentPeers) {
            if (this._peers.has(pid))
                continue;
            const asOfferer = this._localId < pid;
            this._connectTo(pid, asOfferer);
            if (!asOfferer) {
                // We're the higher-id side, so we don't initiate. Nudge the
                // offerer in case they had torn down their PC to us (e.g. via a
                // previous bye); without this they'd sit idle and audio would
                // never re-establish after a non-offerer re-enable.
                this._send({ type: 'voice', to: pid, signal: { kind: 'hello' } });
            }
        }
    }
    disable() {
        // Tear down unconditionally — answerer-side PCs can be created from
        // inbound `handleSignal` calls even when we never enabled, and on
        // session close those would otherwise leak (RTCPeerConnection +
        // inbound MediaStream + ICE).
        const wasEnabled = this._enabled;
        this._enabled = false;
        // Cancel any in-flight enable(): if its getUserMedia is still
        // pending, this bumped generation makes it discard the resulting
        // stream instead of flipping `_enabled` true after we left.
        this._generation++;
        // Tell each peer to drop their PC to us. Without this, the remote
        // keeps an orphaned PC alive (RTCPeerConnection.close() does not
        // signal anything to the remote) and on a subsequent enable() our
        // fresh offer collides with the stale PC's DTLS/ICE state — audio
        // silently fails to negotiate even though both sides show the
        // correct "voice on" affordance.
        for (const [pid] of this._peers) {
            this._send({ type: 'voice', to: pid, signal: { kind: 'bye' } });
        }
        for (const [pid] of this._peers)
            this._teardown(pid);
        this._localStream?.getTracks().forEach((t) => t.stop());
        this._localStream = undefined;
        if (wasEnabled)
            this._opts.onLocalStateChange(false);
    }
    /** Mute/unmute the local mic without tearing connections down. */
    setMuted(muted) {
        this._localStream?.getAudioTracks().forEach((t) => (t.enabled = !muted));
    }
    /** NetSession invokes this on peer-join so we can negotiate. */
    notifyPeerJoined(peerId) {
        if (!this._enabled)
            return;
        this._connectTo(peerId, this._localId < peerId);
    }
    notifyPeerLeft(peerId) {
        this._teardown(peerId);
    }
    /** NetSession routes inbound voice signals here. */
    async handleSignal(from, msg) {
        const sig = msg.signal;
        if (sig.kind === 'bye') {
            // Remote disabled voice and asked us to drop the PC. Without this
            // we'd hang on to a stale PC that would collide with their next
            // offer when they re-enable.
            this._teardown(from);
            return;
        }
        if (sig.kind === 'hello') {
            // Remote enabled voice and is the non-offerer side, asking us to
            // (re)initiate. Only act if we're enabled, we're the natural
            // offerer for them, and we don't already have a live PC.
            if (this._enabled && this._localId < from && !this._peers.has(from)) {
                this._connectTo(from, true);
            }
            return;
        }
        let peer = this._peers.get(from);
        if (!peer) {
            // Remote initiated; we're the answerer.
            peer = this._connectTo(from, false);
        }
        try {
            if (sig.kind === 'offer') {
                await peer.pc.setRemoteDescription({ type: 'offer', sdp: sig.sdp });
                const answer = await peer.pc.createAnswer();
                await peer.pc.setLocalDescription(answer);
                this._send({
                    type: 'voice',
                    to: from,
                    signal: { kind: 'answer', sdp: answer.sdp ?? '' },
                });
            }
            else if (sig.kind === 'answer') {
                await peer.pc.setRemoteDescription({ type: 'answer', sdp: sig.sdp });
            }
            else if (sig.kind === 'ice') {
                await peer.pc.addIceCandidate(sig.candidate).catch(() => undefined);
            }
        }
        catch (err) {
            console.error('[netblocks/voice] signal error:', err);
        }
    }
    _connectTo(peerId, asOfferer) {
        let entry = this._peers.get(peerId);
        if (entry)
            return entry;
        const pc = new RTCPeerConnection({ iceServers: this._opts.iceServers });
        entry = { pc, isOfferer: asOfferer };
        this._peers.set(peerId, entry);
        if (this._localStream) {
            for (const t of this._localStream.getTracks())
                pc.addTrack(t, this._localStream);
        }
        pc.addEventListener('icecandidate', (ev) => {
            if (ev.candidate) {
                this._send({
                    type: 'voice',
                    to: peerId,
                    signal: { kind: 'ice', candidate: ev.candidate.toJSON() },
                });
            }
        });
        pc.addEventListener('track', (ev) => {
            const stream = ev.streams[0] ?? new MediaStream([ev.track]);
            entry.inbound = stream;
            for (const h of this._onTrack)
                h(peerId, stream);
            // The PC stays open for the lifetime of the peer connection even
            // when a remote temporarily stops sending audio (e.g. they hit
            // their own `disable()` which calls `track.stop()` on their
            // outbound). Fire onTrackRemoved when the receiver's track ends
            // so listeners (spatial voice, lipsync, label affordances) can
            // collapse their state. Re-fire onTrack on `unmute` so the
            // affordances come back if the peer toggles voice on again
            // without re-negotiating.
            ev.track.addEventListener('ended', () => {
                for (const h of this._onTrackRemoved)
                    h(peerId);
            });
            ev.track.addEventListener('mute', () => {
                for (const h of this._onTrackRemoved)
                    h(peerId);
            });
            ev.track.addEventListener('unmute', () => {
                for (const h of this._onTrack)
                    h(peerId, stream);
            });
        });
        pc.addEventListener('connectionstatechange', () => {
            if (pc.connectionState === 'failed' || pc.connectionState === 'closed') {
                this._teardown(peerId);
            }
        });
        if (asOfferer) {
            void this._makeOffer(peerId, entry);
        }
        return entry;
    }
    async _makeOffer(peerId, entry) {
        try {
            const offer = await entry.pc.createOffer();
            await entry.pc.setLocalDescription(offer);
            this._send({
                type: 'voice',
                to: peerId,
                signal: { kind: 'offer', sdp: offer.sdp ?? '' },
            });
        }
        catch (err) {
            console.error('[netblocks/voice] offer failed:', err);
        }
    }
    _teardown(peerId) {
        const entry = this._peers.get(peerId);
        if (!entry)
            return;
        try {
            entry.pc.close();
        }
        catch {
            // ignore
        }
        this._peers.delete(peerId);
        for (const h of this._onTrackRemoved)
            h(peerId);
    }
}

export { VoiceChat };
