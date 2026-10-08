import { MIN_AUDIO_DURATION_SECONDS, YAMNET_DIMENSIONS, YAMNET_MIN_SAMPLES, YAMNET_SAMPLE_RATE } from "./constants.js";
//#region src/addons/interactive-ml/Yamnet.ts
/** Windowed-sinc resampling, including a low-pass filter when downsampling. */
function resampleAudio(clip) {
	const { samples, sampleRate } = clip;
	if (!(samples instanceof Float32Array) || !Number.isFinite(sampleRate) || sampleRate < 8e3 || sampleRate > 192e3 || samples.length < sampleRate * .1 || samples.length > sampleRate * 10 || !samples.every((v) => Number.isFinite(v) && Math.abs(v) <= 1)) throw new Error(`Provide ${MIN_AUDIO_DURATION_SECONDS}–10 seconds of finite mono PCM in [-1, 1].`);
	if (sampleRate === 16e3) return samples.slice();
	const ratio = sampleRate / YAMNET_SAMPLE_RATE;
	const cutoff = Math.min(1, 1 / ratio);
	const radius = Math.ceil(16 / cutoff);
	const output = new Float32Array(Math.round(samples.length / ratio));
	for (let i = 0; i < output.length; i++) {
		const center = i * ratio;
		let sum = 0, weights = 0;
		for (let j = Math.max(0, Math.ceil(center - radius)); j <= Math.min(samples.length - 1, Math.floor(center + radius)); j++) {
			const distance = j - center;
			const phase = Math.PI * distance * cutoff;
			const weight = (Math.abs(phase) < 1e-8 ? 1 : Math.sin(phase) / phase) * (.5 + .5 * Math.cos(Math.PI * distance / radius));
			sum += samples[j] * weight;
			weights += weight;
		}
		output[i] = Math.max(-1, Math.min(1, sum / weights));
	}
	return output;
}
/** Run in a worker for live XR. The caller owns the TensorFlow.js runtime.
* Model assets may be served locally; keep featureId tied to the exact weights.
*/
var YamnetExtractor = class YamnetExtractor {
	constructor(tf, model, featureId) {
		this.tf = tf;
		this.model = model;
		this.featureId = featureId;
		this.dimensions = YAMNET_DIMENSIONS;
		this.closed = false;
		this.busy = false;
	}
	static async load(tf, options = {}) {
		if (options.url && !options.featureId) throw new Error("A custom model URL requires its exact feature identity.");
		const model = await tf.loadGraphModel(options.url ?? "https://tfhub.dev/google/tfjs-model/yamnet/tfjs/1", { fromTFHub: options.fromTFHub ?? !options.url });
		return new YamnetExtractor(tf, model, options.featureId ?? "google-yamnet-tfjs-1:mono16k-mean-l2-v1");
	}
	async extract(clip) {
		if (this.closed || this.busy) throw new Error(this.closed ? "Extractor is disposed." : "Audio extraction is already running.");
		const samples = resampleAudio(clip);
		const waveform = samples.length >= 15600 ? samples : new Float32Array(YAMNET_MIN_SAMPLES);
		if (waveform !== samples) waveform.set(samples);
		this.busy = true;
		let input;
		let outputs = [];
		try {
			input = this.tf.tensor1d(waveform);
			const result = this.model.predict(input);
			outputs = Array.isArray(result) ? result : "shape" in result ? [result] : Object.values(result);
			const embedding = outputs.find((t) => t.shape.length === 2 && t.shape[1] === 1024);
			if (!embedding || !embedding.shape[0]) throw new Error(`YAMNet did not return ${YAMNET_DIMENSIONS}-dimensional embeddings.`);
			const values = await embedding.data();
			const features = Array.from({ length: YAMNET_DIMENSIONS }, (_, i) => {
				let sum = 0;
				for (let row = 0; row < embedding.shape[0]; row++) sum += values[row * YAMNET_DIMENSIONS + i];
				return sum / embedding.shape[0];
			});
			const norm = Math.hypot(...features) || 1;
			return features.map((v) => v / norm);
		} finally {
			input?.dispose();
			for (const output of new Set(outputs)) output.dispose();
			this.busy = false;
			if (this.closed) this.model.dispose();
		}
	}
	dispose() {
		if (this.closed) return;
		this.closed = true;
		if (!this.busy) this.model.dispose();
	}
};
//#endregion
export { YamnetExtractor, resampleAudio };
