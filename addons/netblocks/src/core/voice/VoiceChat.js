import { DEFAULT_ICE_SERVERS } from '../constants/NetConstants.js';

class VoiceChat {
    constructor(send, opts = {}) {
        this._peers = new Map();
        this._enabled = false;
        this._localId = '';
        this._send = send;
        this._opts = {
            iceServers: opts.iceServers ?? DEFAULT_ICE_SERVERS,
            audioConstraints: opts.audioConstraints ?? {
                echoCancellation: true,
                noiseSuppression: true,
            },
        };
    }
    setLocalPeerId(id) {
        this._localId = id;
    }
    onTrack(handler) {
        this._onTrack = handler;
    }
    onTrackRemoved(handler) {
        this._onTrackRemoved = handler;
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
        this._localStream = await navigator.mediaDevices.getUserMedia({
            audio: this._opts.audioConstraints,
        });
        this._enabled = true;
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
            this._connectTo(pid, /* asOfferer */ this._localId < pid);
        }
    }
    disable() {
        // Tear down unconditionally — answerer-side PCs can be created from
        // inbound `handleSignal` calls even when we never enabled, and on
        // session close those would otherwise leak (RTCPeerConnection +
        // inbound MediaStream + ICE).
        this._enabled = false;
        for (const [pid] of this._peers)
            this._teardown(pid);
        this._localStream?.getTracks().forEach((t) => t.stop());
        this._localStream = undefined;
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
        let peer = this._peers.get(from);
        if (!peer) {
            // Remote initiated; we're the answerer.
            peer = this._connectTo(from, false);
        }
        const sig = msg.signal;
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
            this._onTrack?.(peerId, stream);
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
        this._onTrackRemoved?.(peerId);
    }
}

export { VoiceChat };
