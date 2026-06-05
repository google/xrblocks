import { Script, ZERO_VISEME } from 'xrblocks';
import { computeAudioFeatures } from './computeAudioFeatures.js';
import { FormantVisemeMapper } from './FormantVisemeMapper.js';
import './BlendshapeReducer.js';

/**
 * `LipsyncMouth` reads audio from a `MediaStream`, runs an FFT +
 * formant-based viseme mapper on it every frame, and writes the
 * resulting viseme weights to a {@link VisemeTarget} (typically a
 * {@link StylizedFace}). It owns no visual of its own — the face you
 * pass via `target` is the only thing on screen.
 *
 * Extends `Script` so the xrblocks scripts manager calls `init()` once
 * the instance is part of the active scene and `update(time)` every
 * frame. `dispose()` is called automatically by the scripts manager on
 * the next sync after the instance is removed from the scene graph; it
 * disconnects audio nodes and releases internal state. It
 * deliberately never stops the input `MediaStream` tracks (the caller
 * owns those), never closes a caller-supplied `AudioContext`, and
 * never disposes the target face (the avatar / host owns that too).
 *
 * Instances are one-shot: after `dispose()` runs (i.e. once the script
 * has been removed from the scene), do NOT re-add the same instance.
 * Construct a new `LipsyncMouth` for the next attachment.
 *
 * Standalone (e.g. puppet sample):
 *
 * ```ts
 * const face = new StylizedFace({showEyes: false});
 * puppetHead.add(face);
 * const driver = new LipsyncMouth(micStream, {target: face});
 * puppetHead.add(driver);
 * ```
 *
 * Multiplayer netblocks avatar:
 *
 * ```ts
 * session.voice.onTrack((peerId, stream) => {
 *   const user = session.users.get(peerId)!;
 *   const driver = new LipsyncMouth(stream, {
 *     target: user.avatar.face,
 *     audioContext: THREE.AudioContext.getContext(),
 *   });
 *   user.avatar.add(driver);
 * });
 * ```
 */
class LipsyncMouth extends Script {
    constructor(stream, opts) {
        super();
        this.mapper = new FormantVisemeMapper();
        this.lastTime = 0;
        /** Wall-clock ms when the most recent silence run started, or null. */
        this.silenceSinceMs = null;
        this.stream = stream;
        this.target = opts.target;
        this.fftSize = opts.fftSize ?? 1024;
        this.silenceThreshold = opts.silenceThreshold ?? 0.01;
        this.silenceHoldMs = opts.silenceHoldMs ?? 150;
        this.externalContext = !!opts.audioContext;
        this.ctx = opts.audioContext;
    }
    async init() {
        if (!this.ctx) {
            // Fall back to a fresh context; prefer this only for single-mouth
            // demos. Multi-peer callers should pass a shared context.
            this.ctx = new AudioContext();
        }
        // Browsers create the shared AudioContext suspended until a user
        // gesture. resume() is a no-op when already running.
        void this.ctx.resume?.().catch(() => undefined);
        this.source = this.ctx.createMediaStreamSource(this.stream);
        this.analyser = this.ctx.createAnalyser();
        this.analyser.fftSize = this.fftSize;
        // Higher smoothingTimeConstant = more time-averaging on the FFT
        // magnitudes upstream of everything; cuts the per-frame bin jitter
        // that destabilises formant peak picking on sustained vowels.
        this.analyser.smoothingTimeConstant = 0.7;
        this.source.connect(this.analyser);
        this.freqData = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount));
        this.timeData = new Uint8Array(new ArrayBuffer(this.analyser.fftSize));
        // Chromium WebRTC quirk: a MediaStreamAudioSourceNode built from a
        // remote stream stays silent unless the stream is also being pumped
        // by an HTMLMediaElement. Same fix SpatialVoice uses. Harmless for
        // local mic streams.
        if (typeof document !== 'undefined') {
            const primer = document.createElement('audio');
            primer.muted = true;
            primer.autoplay = true;
            primer.srcObject = this.stream;
            // play() returns a Promise on modern browsers, undefined on older
            // ones (and in jsdom). Optional-chain both.
            const playP = primer.play();
            playP?.catch?.(() => undefined);
            this.primer = primer;
        }
    }
    update(time) {
        if (!this.analyser || !this.freqData || !this.timeData)
            return;
        // xrblocks passes `time` in milliseconds (matches the rest of the
        // codebase; see e.g. netblocks samples). Convert to seconds so the
        // mapper's `1 - exp(-dt / tau)` smoothing stays frame-rate
        // independent across 60/72/90/120 Hz XR refresh.
        const nowMs = typeof time === 'number' ? time : performance.now();
        const dt = this.lastTime
            ? Math.max(0.001, Math.min(0.1, (nowMs - this.lastTime) / 1000))
            : 0.016;
        this.lastTime = nowMs;
        this.analyser.getByteFrequencyData(this.freqData);
        this.analyser.getByteTimeDomainData(this.timeData);
        const features = computeAudioFeatures({ freqData: this.freqData, timeData: this.timeData }, this.ctx.sampleRate);
        // Silence hysteresis: brief sub-threshold gaps (plosive stops,
        // breaths, syllable boundaries) hold the previous visemes so the
        // mouth doesn't jitter. Only after `silenceHoldMs` of continuous
        // silence do we let the mapper's smoothing close the mouth.
        // Schmitt-trigger style: once silent, we only exit silence when
        // RMS rises clearly above the threshold (× 1.25), so mic noise
        // hovering near `silenceThreshold` doesn't keep resetting the
        // hold timer and prevent the mouth from ever closing.
        const inSilence = this.silenceSinceMs !== null;
        const exitThreshold = this.silenceThreshold * 1.25;
        const isSilent = inSilence
            ? features.rms < exitThreshold
            : features.rms < this.silenceThreshold;
        if (isSilent) {
            if (this.silenceSinceMs === null)
                this.silenceSinceMs = nowMs;
            if (nowMs - this.silenceSinceMs < this.silenceHoldMs)
                return;
        }
        else {
            this.silenceSinceMs = null;
        }
        const visemes = this.mapper.update(features, dt);
        this.target.setVisemes(visemes);
    }
    dispose() {
        try {
            this.source?.disconnect();
        }
        catch {
            // ignore
        }
        try {
            this.analyser?.disconnect();
        }
        catch {
            // ignore
        }
        if (this.primer) {
            try {
                this.primer.pause();
            }
            catch {
                // ignore
            }
            this.primer.srcObject = null;
            this.primer = undefined;
        }
        if (this.ctx && !this.externalContext) {
            // Only close contexts we created.
            void this.ctx.close?.().catch(() => undefined);
        }
        this.source = undefined;
        this.analyser = undefined;
        this.freqData = undefined;
        this.timeData = undefined;
        this.ctx = undefined;
        // Reset the target to its rest pose. Without this, a peer who
        // disabled their mic mid-vowel would leave their avatar's mouth
        // frozen open until something else drove the face. We never
        // dispose the target itself — the caller owns its lifetime.
        try {
            this.target.setVisemes(ZERO_VISEME);
        }
        catch {
            // ignore — target may already be disposed by the host (e.g.
            // the avatar was removed in the same frame).
        }
    }
}

export { LipsyncMouth };
