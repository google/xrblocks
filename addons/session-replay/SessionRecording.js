import * as THREE from "three";
import { HAND_JOINT_NAMES } from "xrblocks";
//#region src/addons/session-replay/SessionRecording.ts
const SESSION_RECORDING_FORMAT = "xrblocks-session";
const SESSION_RECORDING_VERSION = 1;
const POSE_LENGTH = 7;
const HAND_LENGTH = HAND_JOINT_NAMES.length * 7;
function fail(message) {
	throw new Error(`Invalid session recording: ${message}`);
}
function isNumberArray(value, length) {
	return Array.isArray(value) && value.length === length && value.every((item) => typeof item === "number" && Number.isFinite(item));
}
function validateSides(value, where, validate) {
	if (!Array.isArray(value) || value.length !== 2) fail(`${where} must be a [left, right] array.`);
	value.forEach((item, side) => {
		if (item !== null) validate(item, `${where}[${side}]`);
	});
}
function validateController(value, where) {
	if (typeof value !== "object" || value === null) fail(`${where} must be an object or null.`);
	const controller = value;
	if (!isNumberArray(controller.pose, 7)) fail(`${where}.pose must be 7 finite numbers.`);
	if (typeof controller.selected !== "boolean") fail(`${where}.selected must be a boolean.`);
}
function validateHand(value, where) {
	if (!isNumberArray(value, HAND_LENGTH)) fail(`${where} must be ${HAND_LENGTH} finite numbers or null.`);
}
/**
* Parses and validates a session recording, such as the contents of a file
* saved with {@link downloadSessionRecording}.
* @param input - JSON text or an already parsed object.
* @returns The validated recording.
*/
function parseSessionRecording(input) {
	const value = typeof input === "string" ? JSON.parse(input) : input;
	if (typeof value !== "object" || value === null) fail("expected an object.");
	const recording = value;
	if (recording.format !== "xrblocks-session") fail(`format must be "${SESSION_RECORDING_FORMAT}".`);
	if (recording.version !== 1) fail(`unsupported version ${String(recording.version)}.`);
	if (![
		"xr",
		"simulator",
		"desktop"
	].includes(recording.source)) fail("source must be \"xr\", \"simulator\", or \"desktop\".");
	if (!Array.isArray(recording.jointNames) || recording.jointNames.length !== HAND_JOINT_NAMES.length || recording.jointNames.some((name, i) => name !== HAND_JOINT_NAMES[i])) fail("jointNames must match HAND_JOINT_NAMES.");
	if (recording.environment !== void 0) {
		const environment = recording.environment;
		if (typeof environment !== "object" || environment === null || typeof environment.manifestPath !== "string" || environment.name !== void 0 && typeof environment.name !== "string") fail("environment must have a string manifestPath and optional name.");
	}
	if (!Array.isArray(recording.frames)) fail("frames must be an array.");
	let previousTime = 0;
	recording.frames.forEach((frame, i) => {
		const where = `frames[${i}]`;
		if (typeof frame !== "object" || frame === null) fail(`${where} must be an object.`);
		if (!Number.isFinite(frame.t) || frame.t < previousTime) fail(`${where}.t must be a finite, non-decreasing number.`);
		previousTime = frame.t;
		if (!isNumberArray(frame.head, 7)) fail(`${where}.head must be 7 finite numbers.`);
		validateSides(frame.controllers, `${where}.controllers`, validateController);
		validateSides(frame.hands, `${where}.hands`, validateHand);
	});
	return recording;
}
/** Duration of a recording in milliseconds. */
function getSessionRecordingDuration(recording) {
	return recording.frames.at(-1)?.t ?? 0;
}
function lerpPoses(a, b, alpha) {
	const out = new Array(a.length);
	for (let offset = 0; offset < a.length; offset += 7) {
		for (let i = 0; i < 3; i++) out[offset + i] = a[offset + i] + (b[offset + i] - a[offset + i]) * alpha;
		THREE.Quaternion.slerpFlat(out, offset + 3, a, offset + 3, b, offset + 3, alpha);
	}
	return out;
}
function findFrameIndex(frames, timeMs) {
	let low = 0;
	let high = frames.length - 1;
	while (low < high) {
		const mid = Math.ceil((low + high) / 2);
		if (frames[mid].t <= timeMs) low = mid;
		else high = mid - 1;
	}
	return low;
}
/**
* Returns the recorded state at `timeMs`, interpolating poses between the
* surrounding frames. Selection and tracking changes take effect at the frame
* where they were recorded.
*/
function sampleSessionRecording(recording, timeMs) {
	const { frames } = recording;
	if (frames.length === 0) throw new Error("Cannot sample an empty session recording.");
	const index = findFrameIndex(frames, timeMs);
	const a = frames[index];
	const b = frames[Math.min(index + 1, frames.length - 1)];
	const span = b.t - a.t;
	const alpha = span > 0 ? THREE.MathUtils.clamp((timeMs - a.t) / span, 0, 1) : 0;
	const sampleController = (side) => {
		const from = a.controllers[side];
		if (!from) return null;
		const to = b.controllers[side];
		return {
			pose: to ? lerpPoses(from.pose, to.pose, alpha) : from.pose.slice(),
			selected: from.selected
		};
	};
	const sampleHand = (side) => {
		const from = a.hands[side];
		if (!from) return null;
		const to = b.hands[side];
		return to ? lerpPoses(from, to, alpha) : from.slice();
	};
	return {
		t: timeMs,
		head: lerpPoses(a.head, b.head, alpha),
		controllers: [sampleController(0), sampleController(1)],
		hands: [sampleHand(0), sampleHand(1)]
	};
}
/**
* Saves a recording as a JSON file through the browser's download flow.
* @param recording - The recording to save.
* @param filename - Name of the downloaded file.
*/
function downloadSessionRecording(recording, filename = "xrblocks-session.json") {
	const blob = new Blob([JSON.stringify(recording)], { type: "application/json" });
	const url = URL.createObjectURL(blob);
	const link = document.createElement("a");
	link.href = url;
	link.download = filename;
	link.click();
	setTimeout(() => URL.revokeObjectURL(url), 0);
}
//#endregion
export { HAND_LENGTH, POSE_LENGTH, SESSION_RECORDING_FORMAT, SESSION_RECORDING_VERSION, downloadSessionRecording, getSessionRecordingDuration, parseSessionRecording, sampleSessionRecording };
