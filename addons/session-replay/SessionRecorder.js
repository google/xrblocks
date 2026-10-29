import { SESSION_RECORDING_FORMAT } from "./SessionRecording.js";
import * as THREE from "three";
import { Core, HAND_JOINT_NAMES, Script } from "xrblocks";
//#region src/addons/session-replay/SessionRecorder.ts
const SIDES = ["left", "right"];
/** Longer gaps between updates are cut from the recording's timeline. */
const MAX_PAUSE_MS = 500;
const position = new THREE.Vector3();
const quaternion = new THREE.Quaternion();
const scale = new THREE.Vector3();
function round(value) {
	return Math.round(value * 1e5) / 1e5;
}
function writePose(out, offset, matrix) {
	matrix.decompose(position, quaternion, scale);
	out[offset] = round(position.x);
	out[offset + 1] = round(position.y);
	out[offset + 2] = round(position.z);
	out[offset + 3] = round(quaternion.x);
	out[offset + 4] = round(quaternion.y);
	out[offset + 5] = round(quaternion.z);
	out[offset + 6] = round(quaternion.w);
}
function readWorldPose(object) {
	object.updateWorldMatrix(true, false);
	const pose = [];
	writePose(pose, 0, object.matrixWorld);
	return pose;
}
/**
* Finds the WebXR input source index for a hand. Real XR orders input sources
* by connection, not handedness, so prefer the reported handedness.
*/
function findSourceIndex(input, side) {
	let anyReported = false;
	for (let i = 0; i < SIDES.length && i < input.controllers.length; i++) {
		const handedness = input.controllers[i].inputSource?.handedness;
		if (handedness === side) return i;
		anyReported ||= handedness !== void 0;
	}
	return anyReported ? -1 : SIDES.indexOf(side);
}
/**
* Records the user's head, controller, selection, and hand-joint state every
* frame so it can be replayed in the desktop simulator with
* `SessionPlayer`. Works both in a WebXR session and in the simulator.
*/
var SessionRecorder = class extends Script {
	static {
		this.dependencies = {
			core: Core,
			camera: THREE.Camera
		};
	}
	constructor({ sampleIntervalMs = 1e3 / 30 } = {}) {
		super();
		this.lastSampleTime = -Infinity;
		this.lastSelected = [false, false];
		this.sessionEnded = false;
		if (!Number.isFinite(sampleIntervalMs) || sampleIntervalMs < 0) throw new RangeError("sampleIntervalMs must be a finite number >= 0.");
		this.sampleIntervalMs = sampleIntervalMs;
	}
	init({ core, camera }) {
		this.core = core;
		this.camera = camera;
	}
	get isRecording() {
		return this.recording !== void 0;
	}
	/**
	* Starts a new recording. The first frame is captured on the next update.
	* @param options.state - Optional JSON-serializable app state to store with
	* the recording, copied now so later changes don't affect it.
	*/
	start({ state } = {}) {
		if (!this.core || !this.camera) throw new Error("SessionRecorder must be added with xb.add() and initialized before start().");
		this.recording = {
			format: SESSION_RECORDING_FORMAT,
			version: 1,
			source: this.core.renderer?.xr.isPresenting ? "xr" : this.core.simulatorRunning ? "simulator" : "desktop",
			jointNames: [...HAND_JOINT_NAMES],
			frames: []
		};
		const environment = this.core.simulatorRunning ? this.core.simulator?.activeEnvironment : void 0;
		if (environment && this.recording.source === "simulator") {
			const { name, manifestPath } = environment;
			this.recording.environment = name === void 0 ? { manifestPath } : {
				name,
				manifestPath
			};
		}
		if (state !== void 0) this.recording.state = JSON.parse(JSON.stringify(state));
		this.resetTimeline();
	}
	resetTimeline() {
		this.startTime = void 0;
		this.lastSampleTime = -Infinity;
		this.lastUpdateTime = void 0;
		this.lastSelected = [false, false];
		this.sessionEnded = false;
	}
	/**
	* Entering XR while recording on the page restarts the recording as a
	* headset one, keeping its state. The page frames are in a different space.
	*/
	onXRSessionStarted() {
		if (!this.recording || this.recording.source === "xr") return;
		this.recording.source = "xr";
		this.recording.frames = [];
		delete this.recording.environment;
		this.resetTimeline();
	}
	/**
	* Leaving XR ends a headset recording's frames. `stop()` still returns
	* everything captured during the session.
	*/
	onXRSessionEnded() {
		if (this.recording?.source === "xr") this.sessionEnded = true;
	}
	/**
	* Stops recording.
	* @returns The finished recording.
	*/
	stop() {
		if (!this.recording) throw new Error("SessionRecorder is not recording.");
		const recording = this.recording;
		this.recording = void 0;
		return recording;
	}
	update(time = performance.now()) {
		if (!this.recording || !this.core || !this.camera || this.sessionEnded) return;
		this.startTime ??= time;
		const paused = this.lastUpdateTime !== void 0 && time - this.lastUpdateTime > MAX_PAUSE_MS;
		if (paused) this.startTime = time - this.lastSampleTime;
		this.lastUpdateTime = time;
		const t = time - this.startTime;
		const input = this.core.input;
		const indices = SIDES.map((side) => findSourceIndex(input, side));
		const selected = indices.map((index) => input.controllers[index]?.userData.selected === true);
		const selectionChanged = selected.some((value, side) => value !== this.lastSelected[side]);
		if (t - this.lastSampleTime < this.sampleIntervalMs && !selectionChanged && !paused) return;
		this.lastSampleTime = t;
		this.lastSelected = selected;
		const frame = {
			t: Math.round(t),
			head: readWorldPose(this.camera),
			controllers: [this.captureController(indices[0]), this.captureController(indices[1])],
			hands: [this.captureHand(indices[0]), this.captureHand(indices[1])]
		};
		this.recording.frames.push(frame);
	}
	captureController(index) {
		const controller = this.core.input.controllers[index];
		if (!controller?.userData.connected) return null;
		return {
			pose: readWorldPose(controller),
			selected: controller.userData.selected === true
		};
	}
	captureHand(index) {
		const hand = this.core.input.hands[index];
		if (!hand?.visible) return null;
		hand.updateWorldMatrix(true, true);
		const joints = [];
		for (let i = 0; i < HAND_JOINT_NAMES.length; i++) {
			const joint = hand.joints[HAND_JOINT_NAMES[i]];
			if (!joint?.visible) return null;
			writePose(joints, i * 7, joint.matrixWorld);
		}
		return joints;
	}
};
//#endregion
export { SessionRecorder };
