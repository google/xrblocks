import { HAND_FEATURE_ID, HAND_FEATURE_SIZE } from "./constants.js";
import { probabilities } from "./Learning.js";
import { assertLabel, assertVector } from "./Types.js";
import { poseFeatures } from "./HandFeatures.js";
import { decodeTFLite, encodeTFLite } from "./TFLite.js";
//#region src/addons/interactive-ml/Predictor.ts
/** Validates the complete format before a model can replace an active predictor. */
function validateModel(value) {
	if (!value || typeof value !== "object") throw new Error("Invalid model.");
	const m = value;
	if (m.format !== "xrblocks-interactive-ml" || m.version !== 1 || !["hand-pose", "sound"].includes(m.kind) || typeof m.featureId !== "string" || !m.featureId || m.featureId.length > 512 || !Number.isFinite(m.threshold) || m.threshold < 0 || m.threshold > 1) throw new Error("Unsupported model format or settings.");
	if (m.kind !== "sound" && m.featureId !== "xr-hand-palm-v1") throw new Error("Unsupported hand features.");
	const c = m.classifier;
	if (!c || !Array.isArray(c.labels) || c.labels.length < 2 || c.labels.length > 32 || new Set(c.labels).size !== c.labels.length || !Array.isArray(c.mean) || c.mean.length < 1 || c.mean.length > 2048 || m.kind === "hand-pose" && c.mean.length !== HAND_FEATURE_SIZE) throw new Error("Invalid classifier.");
	c.labels.forEach(assertLabel);
	const d = c.mean.length;
	assertVector(c.mean, d);
	assertVector(c.scale, d);
	assertVector(c.bias, c.labels.length);
	assertVector(c.radii, c.labels.length);
	if (c.scale.some((v) => v <= 0) || c.radii.some((v) => v <= 0) || !Array.isArray(c.weights) || c.weights.length !== c.labels.length || !Array.isArray(c.centers) || c.centers.length !== c.labels.length) throw new Error("Invalid classifier dimensions.");
	c.weights.forEach((row) => assertVector(row, d));
	c.centers.forEach((row) => assertVector(row, d));
	return structuredClone(m);
}
/** Immutable weights; safe to share between independent input streams. */
var Predictor = class Predictor {
	constructor(artifact) {
		this.model = validateModel(artifact);
	}
	/** Load a TFLite file exported by Interactive ML. */
	static fromTFLite(bytes) {
		return new Predictor(decodeTFLite(bytes));
	}
	get kind() {
		return this.active.kind;
	}
	get labels() {
		return this.active.classifier.labels.slice();
	}
	get featureId() {
		return this.active.featureId;
	}
	export() {
		return structuredClone(this.active);
	}
	/** Export a TFLite classifier entirely on-device, including label metadata. */
	exportTFLite() {
		return encodeTFLite(this.active);
	}
	dispose() {
		this.model = null;
	}
	get active() {
		if (!this.model) throw new Error("Predictor is disposed.");
		return this.model;
	}
	predictFeatures(features, featureId) {
		const model = this.active;
		if (featureId !== model.featureId) throw new Error("Feature schema does not match this model.");
		const data = model.classifier;
		assertVector(features, data.mean.length);
		const values = probabilities(features, data);
		const best = values.indexOf(Math.max(...values));
		const distance = Math.sqrt(features.reduce((sum, v, i) => sum + ((v - data.mean[i]) / data.scale[i] - data.centers[best][i]) ** 2, 0) / features.length);
		const score = values[best];
		return {
			label: score >= model.threshold && distance <= data.radii[best] ? data.labels[best] : null,
			score,
			scores: Object.fromEntries(data.labels.map((label, i) => [label, values[i]]))
		};
	}
	predictHand(frames) {
		if (this.active.kind !== "hand-pose") throw new Error("Expected a hand-pose model.");
		return this.predictFeatures(poseFeatures(frames), HAND_FEATURE_ID);
	}
};
//#endregion
export { Predictor, validateModel };
