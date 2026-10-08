import { HAND_FEATURE_SIZE, HAND_JOINTS, MAX_HAND_CLIP_DURATION_MS } from "./constants.js";
import { assertVector } from "./Types.js";
import { Vector3 } from "three";
//#region src/addons/interactive-ml/HandFeatures.ts
const points = HAND_JOINTS.map(() => new Vector3());
const wrist = new Vector3();
const x = new Vector3();
const y = new Vector3();
const z = new Vector3();
const offset = new Vector3();
/** Copy normalized pose features directly from the SDK's tracked hand joints. */
function captureHand(hands, handedness, timeMs) {
	const handLabel = handedness === 0 ? "left" : handedness === 1 ? "right" : null;
	const tracked = hands?.hands[handedness];
	if (!handLabel || !tracked?.visible || !Number.isFinite(timeMs)) return null;
	const read = (name, target) => {
		const joint = hands.getJoint(name, handedness);
		if (!joint?.visible) return false;
		joint.getWorldPosition(target);
		return Number.isFinite(target.x) && Number.isFinite(target.y) && Number.isFinite(target.z);
	};
	if (!read("wrist", wrist)) return null;
	for (let i = 0; i < HAND_JOINTS.length; i++) if (!read(HAND_JOINTS[i], points[i])) return null;
	x.subVectors(points[4], points[16]);
	const size = x.length();
	if (size < .005) return null;
	x.divideScalar(size);
	y.subVectors(points[8], wrist);
	y.addScaledVector(x, -y.dot(x));
	if (y.length() < .005) return null;
	y.normalize();
	z.crossVectors(x, y);
	z.multiplyScalar(handLabel === "left" ? -1 : 1);
	const pose = new Array(HAND_FEATURE_SIZE);
	for (let i = 0; i < points.length; i++) {
		offset.subVectors(points[i], wrist).divideScalar(size);
		pose[i * 3] = offset.dot(x);
		pose[i * 3 + 1] = offset.dot(y);
		pose[i * 3 + 2] = offset.dot(z);
	}
	return {
		hand: handLabel,
		timeMs,
		pose
	};
}
function validateFrames(frames) {
	if (!Array.isArray(frames) || frames.length < 1 || frames.length > 300) throw new Error(`Record 1–300 pose frames.`);
	for (let i = 0; i < frames.length; i++) {
		const frame = frames[i];
		if (!frame || !["left", "right"].includes(frame.hand) || frame.hand !== frames[0].hand || !Number.isFinite(frame.timeMs) || i > 0 && frame.timeMs <= frames[i - 1].timeMs) throw new Error("A clip must contain one hand with increasing times.");
		assertVector(frame.pose, HAND_FEATURE_SIZE);
	}
	if (frames.at(-1).timeMs - frames[0].timeMs > 1e4) throw new Error(`Clips must not exceed ${MAX_HAND_CLIP_DURATION_MS / 1e3} seconds.`);
}
function poseFeatures(frames) {
	validateFrames(frames);
	return Array.from({ length: HAND_FEATURE_SIZE }, (_, i) => frames.reduce((sum, frame) => sum + frame.pose[i], 0) / frames.length);
}
//#endregion
export { captureHand, poseFeatures, validateFrames };
