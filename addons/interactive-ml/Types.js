import { RESERVED_LABELS } from "./constants.js";
//#region src/addons/interactive-ml/Types.ts
function evaluatePredictions(examples) {
	const result = {
		total: examples.length,
		correct: 0,
		unknown: 0,
		accuracy: 0,
		confusion: {}
	};
	for (const { label, prediction } of examples) {
		assertLabel(label);
		if (prediction.label === label) result.correct++;
		if (prediction.label === null) result.unknown++;
		const row = result.confusion[label] ??= Object.create(null);
		const predicted = prediction.label ?? "(unknown)";
		row[predicted] = (row[predicted] ?? 0) + 1;
	}
	result.accuracy = result.total ? result.correct / result.total : 0;
	return result;
}
function assertVector(value, length) {
	if (!Array.isArray(value) || value.length !== length || !value.every(Number.isFinite)) throw new Error(`Expected ${length} finite feature values.`);
}
function assertLabel(label) {
	if (typeof label !== "string" || !label.trim() || label.length > 80 || RESERVED_LABELS.includes(label)) throw new Error(`Use a non-empty label of at most 80 characters.`);
}
//#endregion
export { assertLabel, assertVector, evaluatePredictions };
