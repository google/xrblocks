import { computeAudioFeatures } from "./computeAudioFeatures.js";
import { FormantVisemeMapper } from "./FormantVisemeMapper.js";
import { Script, ZERO_VISEME } from "xrblocks";
//#region src/addons/lipsync/LipsyncMouth.ts
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
var LipsyncMouth = class extends Script {
	constructor(stream, opts) {
		super();
		this.mapper = new FormantVisemeMapper();
		this.lastTime = 0;
		this.silenceSinceMs = null;
		this.stream = stream;
		this.target = opts.target;
		this.fftSize = opts.fftSize ?? 1024;
		this.silenceThreshold = opts.silenceThreshold ?? .01;
		this.silenceHoldMs = opts.silenceHoldMs ?? 150;
		this.externalContext = !!opts.audioContext;
		this.ctx = opts.audioContext;
	}
	async init() {
		if (!this.ctx) this.ctx = new AudioContext();
		this.ctx.resume?.().catch(() => void 0);
		this.source = this.ctx.createMediaStreamSource(this.stream);
		this.analyser = this.ctx.createAnalyser();
		this.analyser.fftSize = this.fftSize;
		this.analyser.smoothingTimeConstant = .7;
		this.source.connect(this.analyser);
		this.freqData = new Uint8Array(new ArrayBuffer(this.analyser.frequencyBinCount));
		this.timeData = new Uint8Array(new ArrayBuffer(this.analyser.fftSize));
		if (typeof document !== "undefined") {
			const primer = document.createElement("audio");
			primer.muted = true;
			primer.autoplay = true;
			primer.srcObject = this.stream;
			primer.play()?.catch?.(() => void 0);
			this.primer = primer;
		}
	}
	update(time) {
		if (!this.analyser || !this.freqData || !this.timeData) return;
		const nowMs = typeof time === "number" ? time : performance.now();
		const dt = this.lastTime ? Math.max(.001, Math.min(.1, (nowMs - this.lastTime) / 1e3)) : .016;
		this.lastTime = nowMs;
		this.analyser.getByteFrequencyData(this.freqData);
		this.analyser.getByteTimeDomainData(this.timeData);
		const features = computeAudioFeatures({
			freqData: this.freqData,
			timeData: this.timeData
		}, this.ctx.sampleRate);
		const inSilence = this.silenceSinceMs !== null;
		const exitThreshold = this.silenceThreshold * 1.25;
		if (inSilence ? features.rms < exitThreshold : features.rms < this.silenceThreshold) {
			if (this.silenceSinceMs === null) this.silenceSinceMs = nowMs;
			if (nowMs - this.silenceSinceMs < this.silenceHoldMs) return;
		} else this.silenceSinceMs = null;
		const visemes = this.mapper.update(features, dt);
		this.target.setVisemes(visemes);
	}
	dispose() {
		try {
			this.source?.disconnect();
		} catch {}
		try {
			this.analyser?.disconnect();
		} catch {}
		if (this.primer) {
			try {
				this.primer.pause();
			} catch {}
			this.primer.srcObject = null;
			this.primer = void 0;
		}
		if (this.ctx && !this.externalContext) this.ctx.close?.().catch(() => void 0);
		this.source = void 0;
		this.analyser = void 0;
		this.freqData = void 0;
		this.timeData = void 0;
		this.ctx = void 0;
		try {
			this.target.setVisemes(ZERO_VISEME);
		} catch {}
	}
};
//#endregion
export { LipsyncMouth };
