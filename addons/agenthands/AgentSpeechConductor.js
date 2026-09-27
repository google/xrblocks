//#region src/addons/agenthands/AgentSpeechConductor.ts
const REST_DELAY_S = .8;
const MIN_SPEECH_DURATION_S = 1.2;
const SECONDS_PER_CHAR = .06;
/**
* Estimates how long `text` takes to speak, in seconds. Used to schedule the
* gesture timeline when the synthesizer does not report its own duration.
* @param text - The text to be spoken.
* @returns The estimated duration in seconds.
*/
function estimateSpeechDuration(text) {
	return Math.max(MIN_SPEECH_DURATION_S, text.length * SECONDS_PER_CHAR);
}
/**
* Synchronizes gesture playback with spoken text: the "TTS timestamp matcher".
* A timed queue is the guaranteed driver (it works regardless of the voice),
* and when the synthesizer emits word boundaries the conductor additionally
* fires pending steps a touch early for tighter sync. Each step plays at most
* once per utterance, so a step fired early on a boundary is not replayed when
* the timed queue reaches it (which matters for animated motions).
*/
var AgentSpeechConductor = class {
	/**
	* @param options - The synthesizer to speak through (optional) and the
	*     callbacks that apply the timeline to the hands.
	*/
	constructor(options) {
		this.speaking = false;
		this.queue = [];
		this.timer = 0;
		this.fired = /* @__PURE__ */ new Set();
		this.synth = options.synthesizer;
		this.callbacks = options;
	}
	/**
	* Speaks `text` and plays its gesture `steps` in sync. The timed queue fires
	* each step at its estimated time and rests at the end; if the voice emits
	* boundaries, matching steps fire early for tighter timing.
	* @param text - The text to speak.
	* @param steps - The timed gesture steps for `text`.
	* @param duration - Estimated spoken duration of `text`, in seconds.
	*/
	speak(text, steps, duration) {
		this.queue = [...steps.map((step) => ({
			at: step.at,
			step
		})), {
			at: duration + REST_DELAY_S,
			rest: true
		}];
		this.timer = 0;
		this.fired.clear();
		this.speaking = true;
		const synth = this.synth;
		if (synth?.speak) {
			const pending = [...steps];
			synth.onBoundaryCallback = (charIndex) => {
				while (pending.length && pending[0].charIndex <= charIndex) this.fireStep_(pending.shift());
			};
			try {
				Promise.resolve(synth.speak(text)).catch(() => {}).finally(() => {
					synth.onBoundaryCallback = void 0;
				});
			} catch {
				synth.onBoundaryCallback = void 0;
			}
		}
	}
	/**
	* Plays a bare timeline with no speech, e.g. a scripted (no-key) demo line.
	* @param entries - The timeline entries to play.
	*/
	playTimeline(entries) {
		this.queue = [...entries];
		this.timer = 0;
		this.fired.clear();
	}
	/**
	* Advances the timeline, firing each entry whose time has arrived.
	* @param dt - Elapsed time since the last tick, in seconds.
	*/
	tick(dt) {
		this.timer += dt;
		while (this.queue.length && this.timer >= this.queue[0].at) {
			const entry = this.queue.shift();
			if (entry.rest) {
				this.speaking = false;
				this.callbacks.onRest();
			} else if (entry.step) this.fireStep_(entry.step);
			if (entry.next !== void 0) this.callbacks.onNext?.(entry.next);
		}
	}
	fireStep_(step) {
		if (this.fired.has(step)) return;
		this.fired.add(step);
		this.callbacks.onStep(step);
	}
};
//#endregion
export { AgentSpeechConductor, estimateSpeechDuration };
