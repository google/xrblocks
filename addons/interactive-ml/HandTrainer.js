import { HAND_FEATURE_ID, HAND_PROJECT_FORMAT, MODEL_FORMAT } from "./constants.js";
import { trainClassifier } from "./Learning.js";
import { evaluatePredictions } from "./Types.js";
import { poseFeatures, validateFrames } from "./HandFeatures.js";
import { Dataset } from "./Dataset.js";
import { Predictor } from "./Predictor.js";
//#region src/addons/interactive-ml/HandTrainer.ts
/** A persistent dataset. Training snapshots it and never changes an active model. */
var HandTrainer = class HandTrainer extends Dataset {
	constructor(..._args) {
		super(..._args);
		this.kind = "hand-pose";
	}
	addExample(label, frames) {
		validateFrames(frames);
		return this.add({
			label,
			frames
		});
	}
	exportProject() {
		return structuredClone({
			format: HAND_PROJECT_FORMAT,
			version: 1,
			kind: this.kind,
			examples: this.examples
		});
	}
	static loadProject(value) {
		const p = value;
		if (!p || p.format !== "xrblocks-interactive-ml-project" || p.version !== 1 || p.kind !== "hand-pose" || !Array.isArray(p.examples) || p.examples.length > 512) throw new Error("Unsupported training project.");
		const trainer = new HandTrainer();
		trainer.restore(p.examples, (example) => validateFrames(example.frames));
		return trainer;
	}
	async train(options = {}) {
		options.signal?.throwIfAborted();
		const examples = structuredClone(this.examples);
		if (!examples.length) throw new Error("Record examples first.");
		const artifact = {
			format: MODEL_FORMAT,
			version: 1,
			kind: this.kind,
			featureId: HAND_FEATURE_ID,
			threshold: options.threshold ?? .65,
			classifier: await trainClassifier(examples.map((e) => ({
				label: e.label,
				features: poseFeatures(e.frames)
			})), options)
		};
		options.signal?.throwIfAborted();
		return new Predictor(artifact);
	}
	/** Pass separate recordings, never the examples used to train this predictor. */
	evaluate(predictor, examples) {
		if (predictor.kind !== this.kind) throw new Error("Model kind does not match.");
		return evaluatePredictions(examples.map((e) => ({
			label: e.label,
			prediction: predictor.predictHand(e.frames)
		})));
	}
};
//#endregion
export { HandTrainer };
