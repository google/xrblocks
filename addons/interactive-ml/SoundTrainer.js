import { MODEL_FORMAT, SOUND_PROJECT_FORMAT } from "./constants.js";
import { trainClassifier } from "./Learning.js";
import { assertLabel, assertVector, evaluatePredictions } from "./Types.js";
import { Predictor } from "./Predictor.js";
//#region src/addons/interactive-ml/SoundTrainer.ts
var SoundTrainer = class SoundTrainer {
	constructor(extractor) {
		this.extractor = extractor;
		this.examples = [];
		if (!extractor.featureId || extractor.featureId.length > 512 || !Number.isInteger(extractor.dimensions) || extractor.dimensions < 1 || extractor.dimensions > 2048) throw new Error("Invalid audio feature extractor.");
	}
	get counts() {
		return Object.fromEntries([...new Set(this.examples.map((e) => e.label))].map((label) => [label, this.examples.filter((e) => e.label === label).length]));
	}
	async addExample(label, clip) {
		assertLabel(label);
		return this.addFeatures(label, await this.extractor.extract(clip));
	}
	addFeatures(label, features) {
		assertLabel(label);
		assertVector(features, this.extractor.dimensions);
		const counts = this.counts;
		if (this.examples.length >= 512 || (counts[label] ?? 0) >= 64 || !(label in counts) && Object.keys(counts).length >= 32) throw new Error("Dataset limit reached. Remove examples first.");
		const id = crypto.randomUUID();
		this.examples.push({
			id,
			label,
			features: features.slice()
		});
		return id;
	}
	removeExample(id) {
		this.examples = this.examples.filter((e) => e.id !== id);
	}
	relabelExample(id, label) {
		assertLabel(label);
		const example = this.examples.find((e) => e.id === id);
		if (!example) throw new Error("Unknown example.");
		if (example.label === label) return;
		const counts = this.counts;
		if ((counts[label] ?? 0) >= 64 || !(label in counts) && Object.keys(counts).length >= 32 && counts[example.label] > 1) throw new Error("Class limit reached.");
		example.label = label;
	}
	async train(options = {}) {
		const classifier = await trainClassifier(structuredClone(this.examples), options);
		return new Predictor({
			format: MODEL_FORMAT,
			version: 1,
			kind: "sound",
			featureId: this.extractor.featureId,
			threshold: options.threshold ?? .65,
			classifier
		});
	}
	async predict(predictor, clip) {
		if (predictor.kind !== "sound" || predictor.featureId !== this.extractor.featureId) throw new Error("Audio model does not match this extractor.");
		return predictor.predictFeatures(await this.extractor.extract(clip), this.extractor.featureId);
	}
	async evaluate(predictor, examples) {
		const results = [];
		for (const e of examples) results.push({
			label: e.label,
			prediction: await this.predict(predictor, e.clip)
		});
		return evaluatePredictions(results);
	}
	exportProject() {
		return structuredClone({
			format: SOUND_PROJECT_FORMAT,
			version: 1,
			featureId: this.extractor.featureId,
			dimensions: this.extractor.dimensions,
			examples: this.examples
		});
	}
	static loadProject(value, extractor) {
		const p = value;
		if (!p || p.format !== "xrblocks-interactive-ml-sound-project" || p.version !== 1 || p.featureId !== extractor.featureId || p.dimensions !== extractor.dimensions || !Array.isArray(p.examples) || p.examples.length > 512) throw new Error("Incompatible sound project.");
		const trainer = new SoundTrainer(extractor);
		const ids = /* @__PURE__ */ new Set();
		for (const example of p.examples) {
			if (!example || typeof example.id !== "string" || !example.id || ids.has(example.id)) throw new Error("Invalid example ID.");
			trainer.addFeatures(example.label, example.features);
			trainer.examples.at(-1).id = example.id;
			ids.add(example.id);
		}
		return trainer;
	}
};
//#endregion
export { SoundTrainer };
