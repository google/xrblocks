// Extra time after the estimated speech duration before the hands rest, so the
// last gesture holds briefly rather than snapping back the instant TTS ends.
const REST_DELAY_S = 0.8;
// Speech-duration estimate: a per-character rate with a floor so even a very
// short reply leaves time for its gestures to play.
const MIN_SPEECH_DURATION_S = 1.2;
const SECONDS_PER_CHAR = 0.06;
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
class AgentSpeechConductor {
    /**
     * @param options - The synthesizer to speak through (optional) and the
     *     callbacks that apply the timeline to the hands.
     */
    constructor(options) {
        /** Whether the agent is currently speaking. */
        this.speaking = false;
        this.queue = [];
        this.timer = 0;
        // Steps already played this utterance, so a step fired early on a word
        // boundary is not played again when the timed queue reaches it.
        this.fired = new Set();
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
        this.queue = [
            ...steps.map((step) => ({ at: step.at, step })),
            { at: duration + REST_DELAY_S, rest: true },
        ];
        this.timer = 0;
        this.fired.clear();
        this.speaking = true;
        const synth = this.synth;
        if (synth?.speak) {
            const pending = [...steps];
            synth.onBoundaryCallback = (charIndex) => {
                while (pending.length && pending[0].charIndex <= charIndex) {
                    this.fireStep_(pending.shift());
                }
            };
            // Clear the callback whether speak() throws synchronously or the returned
            // promise rejects, so a failure never leaves a stale boundary handler.
            try {
                Promise.resolve(synth.speak(text))
                    .catch(() => { })
                    .finally(() => {
                    synth.onBoundaryCallback = undefined;
                });
            }
            catch {
                synth.onBoundaryCallback = undefined;
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
            }
            else if (entry.step) {
                this.fireStep_(entry.step);
            }
            if (entry.next !== undefined)
                this.callbacks.onNext?.(entry.next);
        }
    }
    // Plays a step at most once per utterance (boundary firing and the timed
    // queue both route through here, so a step never plays twice).
    fireStep_(step) {
        if (this.fired.has(step))
            return;
        this.fired.add(step);
        this.callbacks.onStep(step);
    }
}

export { AgentSpeechConductor, estimateSpeechDuration };
