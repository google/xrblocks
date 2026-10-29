import { getSessionRecordingDuration, sampleSessionRecording } from "./SessionRecording.js";
import * as THREE from "three";
import { Core, HAND_JOINT_NAMES, Script } from "xrblocks";
//#region src/addons/session-replay/SessionPlayer.ts
const SIDES = ["left", "right"];
const WRIST_INDEX = HAND_JOINT_NAMES.indexOf("wrist");
const position = new THREE.Vector3();
const rootPosition = new THREE.Vector3();
const quaternion = new THREE.Quaternion();
const inverseQuaternion = new THREE.Quaternion();
const matrix = new THREE.Matrix4();
const parentInverse = new THREE.Matrix4();
const scale = new THREE.Vector3();
const ONE = new THREE.Vector3(1, 1, 1);
function setWorldPose(object, pose, offset = 0) {
	position.fromArray(pose, offset);
	quaternion.fromArray(pose, offset + 3);
	if (object.parent) {
		object.parent.updateWorldMatrix(true, false);
		matrix.compose(position, quaternion, ONE).premultiply(parentInverse.copy(object.parent.matrixWorld).invert()).decompose(object.position, object.quaternion, scale);
	} else {
		object.position.copy(position);
		object.quaternion.copy(quaternion);
	}
	object.updateMatrix();
	object.updateWorldMatrix(false, true);
}
/**
* Converts world joint poses into bone poses relative to the simulator hand
* root, which follows the controller like the simulator's own hands do.
*/
function toRootRelativeJoints(hand, root, rootOffset) {
	rootPosition.fromArray(root, rootOffset);
	inverseQuaternion.fromArray(root, rootOffset + 3).invert();
	const joints = [];
	for (let i = 0; i < HAND_JOINT_NAMES.length; i++) {
		const offset = i * 7;
		position.fromArray(hand, offset).sub(rootPosition).applyQuaternion(inverseQuaternion);
		quaternion.fromArray(hand, offset + 3).premultiply(inverseQuaternion);
		joints.push({
			t: position.toArray(),
			r: quaternion.toArray()
		});
	}
	return joints;
}
/**
* Replays a recording made with `SessionRecorder` in the desktop simulator.
* Head, controller, and hand-joint poses are driven from the recording, and
* `selectstart` / `selectend` fire where they were recorded, so scripts
* respond as if the user performed the session again.
*
* Poses are applied during script updates. Add the player before other
* scripts so they observe the replayed pose in the same frame.
*/
var SessionPlayer = class extends Script {
	constructor(..._args) {
		super(..._args);
		this.duration = 0;
		this.elapsed = 0;
		this.nextFrameIndex = 0;
		this.selected = [false, false];
	}
	static {
		this.dependencies = {
			core: Core,
			camera: THREE.Camera
		};
	}
	init({ core, camera }) {
		this.core = core;
		this.camera = camera;
	}
	get isPlaying() {
		return this.recording !== void 0;
	}
	/** Milliseconds played in the current recording. */
	get currentTimeMs() {
		return this.elapsed;
	}
	/**
	* Starts replaying a recording, stopping any current playback. A simulator
	* recording first switches to the room it was made in.
	* @param options.environment - Set to `false` to replay in the current
	* simulator room instead of the recorded one.
	* @returns A promise that resolves when playback finishes or is stopped,
	* and rejects if the recorded room cannot be loaded.
	*/
	async play(recording, { environment = true } = {}) {
		if (!this.core || !this.camera) throw new Error("SessionPlayer must be added with xb.add() and initialized before play().");
		if (!this.core.simulatorRunning || !this.core.simulator) throw new Error("SessionPlayer replays into the desktop simulator.");
		if (recording.frames.length === 0) throw new Error("Cannot play an empty session recording.");
		this.stop();
		const { controllers } = this.core.input;
		this.savedConnected = SIDES.map((_, side) => controllers[side]?.userData.connected === true);
		const { hands } = this.core.simulator;
		this.savedHandVisibility = [hands.leftController.visible, hands.rightController.visible];
		this.recording = recording;
		this.duration = getSessionRecordingDuration(recording);
		this.startTime = void 0;
		this.elapsed = 0;
		this.nextFrameIndex = 0;
		const finished = new Promise((resolve) => {
			this.resolvePlayback = resolve;
		});
		const room = recording.environment;
		if (environment && room && this.core.simulator.activeEnvironment?.manifestPath !== room.manifestPath) {
			this.loadingRoomFor = recording;
			try {
				await this.loadEnvironment(room);
			} catch (error) {
				if (this.recording === recording) this.stop();
				throw error;
			} finally {
				if (this.loadingRoomFor === recording) this.loadingRoomFor = void 0;
			}
		}
		return finished;
	}
	async loadEnvironment({ name, manifestPath }) {
		const simulator = this.core.simulator;
		try {
			await (name === void 0 ? simulator.setEnvironment(manifestPath) : simulator.setEnvironment(name, manifestPath));
		} catch (error) {
			const reason = error instanceof Error ? error.message : String(error);
			throw new Error(`Could not load the recorded simulator room "${name ?? manifestPath}": ${reason} Pass {environment: false} to play() to replay in the current room.`);
		}
	}
	/**
	* Stops playback and ends any selection still held by the replay. The head
	* and hands stay at their last replayed pose, and the simulator controllers
	* resume from the hands.
	*/
	stop() {
		if (!this.recording) return;
		this.recording = void 0;
		for (let side = 0; side < SIDES.length; side++) this.setSelected(side, false);
		if (this.savedHandVisibility) {
			this.setHandVisible(0, this.savedHandVisibility[0]);
			this.setHandVisible(1, this.savedHandVisibility[1]);
		}
		this.savedHandVisibility = void 0;
		const { controllers } = this.core.input;
		this.savedConnected?.forEach((connected, side) => {
			if (controllers[side]) controllers[side].userData.connected = connected;
		});
		this.savedConnected = void 0;
		const resolve = this.resolvePlayback;
		this.resolvePlayback = void 0;
		resolve?.();
	}
	update(time = performance.now()) {
		if (!this.recording || this.loadingRoomFor === this.recording) return;
		this.startTime ??= time;
		this.elapsed = Math.min(time - this.startTime, this.duration);
		if (!this.applySelections(this.recording)) this.applyFrame(sampleSessionRecording(this.recording, this.elapsed));
		if (this.elapsed >= this.duration && this.nextFrameIndex >= this.recording.frames.length) this.stop();
	}
	dispose() {
		this.stop();
		super.dispose();
	}
	applyFrame(frame) {
		const core = this.core;
		const camera = this.camera;
		const { hands, simulatorControllerState } = core.simulator;
		setWorldPose(camera, frame.head);
		for (let side = 0; side < SIDES.length; side++) {
			const controller = core.input.controllers[side];
			const handRoot = side === 0 ? hands.leftController : hands.rightController;
			const recordedController = frame.controllers[side];
			const recordedHand = frame.hands[side];
			if (controller) {
				if (recordedController) setWorldPose(controller, recordedController.pose);
				controller.userData.connected = recordedController !== null;
			}
			const root = recordedHand ?? recordedController?.pose;
			if (root) {
				const rootOffset = recordedHand ? WRIST_INDEX * 7 : 0;
				setWorldPose(handRoot, root, rootOffset);
				if (recordedHand) {
					const joints = toRootRelativeJoints(recordedHand, root, rootOffset);
					if (side === 0) hands.setLeftHandJoints(joints);
					else hands.setRightHandJoints(joints);
				}
				camera.worldToLocal(simulatorControllerState.localControllerPositions[side].copy(handRoot.position));
				simulatorControllerState.localControllerOrientations[side].copy(camera.quaternion).invert().multiply(handRoot.quaternion);
			}
			this.setHandVisible(side, recordedHand !== null);
		}
		hands.syncHandJoints();
	}
	/**
	* Fires every selection change recorded since the last update, so a pinch
	* shorter than one playback frame is not skipped. Interaction samples the
	* selected state once per frame, so a second change on the same side waits
	* for the next update. Each change is fired from its frame's exact pose,
	* since a pose blended with the next frame can aim the ray elsewhere.
	* @returns Whether any selection changed, leaving that frame's pose applied.
	*/
	applySelections(recording) {
		const { frames } = recording;
		const changed = [false, false];
		let applied = false;
		while (this.nextFrameIndex < frames.length && frames[this.nextFrameIndex].t <= this.elapsed) {
			const frame = frames[this.nextFrameIndex];
			const next = SIDES.map((_, side) => frame.controllers[side]?.selected ?? false);
			if (next.some((selected, side) => changed[side] && selected !== this.selected[side])) return applied;
			if (next.some((selected, side) => selected !== this.selected[side])) {
				this.applyFrame(frame);
				applied = true;
			}
			for (let side = 0; side < SIDES.length; side++) {
				if (next[side] === this.selected[side]) continue;
				changed[side] = true;
				this.setSelected(side, next[side]);
			}
			this.nextFrameIndex++;
		}
		return applied;
	}
	setHandVisible(side, visible) {
		const { hands } = this.core.simulator;
		(side === 0 ? hands.leftController : hands.rightController).visible = visible;
		const hand = this.core.input.hands[side];
		if (hand) hand.visible = visible;
	}
	setSelected(side, selected) {
		if (this.selected[side] === selected) return;
		this.selected[side] = selected;
		const controller = this.core?.input.controllers[side];
		if (!controller) return;
		this.core.input.dispatchEvent({
			type: selected ? "selectstart" : "selectend",
			target: controller,
			data: { handedness: SIDES[side] }
		});
	}
};
//#endregion
export { SessionPlayer };
