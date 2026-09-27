import * as THREE from "three";
import { HAND_JOINT_NAMES, Handedness, SIMULATOR_HAND_POSE_ROTATIONS, SimulatorHandPose, resolveSimulatorHandPoseRotations } from "xrblocks";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
//#region src/addons/agenthands/AgentHand.ts
/** Public WebXR generic-hand rig used as the agent's hand mesh. */
const AGENT_HAND_PROFILE_PATH = "https://cdn.jsdelivr.net/npm/@webxr-input-profiles/assets@1.0/dist/profiles/generic-hand/";
const WRIST_BONE_INDEX = 0;
const INDEX_TIP_BONE_INDEX = 10;
const REACH_FRACTION = .45;
const MAX_REACH = .35;
const MIN_STANDOFF = .55;
const MIN_AIM_DISTANCE = .2;
const scratchPosition = new THREE.Vector3();
const scratchQuaternion = new THREE.Quaternion();
const scratchQuaternionB = new THREE.Quaternion();
const scratchTarget = new THREE.Vector3();
const scratchDir = new THREE.Vector3();
const scratchDirB = new THREE.Vector3();
const scratchWrist = new THREE.Vector3();
const scratchTip = new THREE.Vector3();
const scratchGoal = new THREE.Vector3();
const scratchGoalQuat = new THREE.Quaternion();
const scratchPivot = new THREE.Vector3();
const HAND_COLOR = 6988031;
const HAND_EMISSIVE = 2845951;
const HAND_OPACITY = .55;
/**
* Re-skins every mesh under `root` with the semi-transparent blue agent-hand
* material. Extracted so it is testable without a GPU or a loaded GLB.
* @param root - The loaded hand scene to recolor in place.
*/
function applyAgentHandAppearance(root) {
	root.traverse((obj) => {
		const mesh = obj;
		if (!mesh.isMesh) return;
		mesh.material = new THREE.MeshStandardMaterial({
			color: HAND_COLOR,
			emissive: HAND_EMISSIVE,
			emissiveIntensity: .4,
			transparent: true,
			opacity: HAND_OPACITY,
			roughness: .35,
			metalness: 0,
			depthWrite: false
		});
		mesh.raycast = () => {};
	});
}
/**
* Smoothly moves a hand's bones toward a target set of joint transforms.
* Extracted as a pure function so the animation step is testable without a GPU
* or a loaded mesh.
* @param bones - The hand's bones, aligned to {@link HAND_JOINT_NAMES}. Missing
*     bones (undefined) are skipped.
* @param joints - Target per-joint transforms (translation + rotation).
* @param lerp - Interpolation factor in [0, 1]; 1 snaps to the target.
*/
function lerpBonesToJoints(bones, joints, lerp) {
	for (let i = 0; i < bones.length; i++) {
		const bone = bones[i];
		const joint = joints[i];
		if (!bone || !joint) continue;
		scratchPosition.fromArray(joint.t);
		scratchQuaternion.fromArray(joint.r);
		bone.position.lerp(scratchPosition, lerp);
		bone.quaternion.slerp(scratchQuaternion, lerp);
	}
}
/**
* A single, free-standing animatable hand (not tied to the user's tracked
* input). Loads the WebXR generic-hand rig, then poses it each frame toward the
* current {@link SimulatorHandPose} using the simulator pose library.
*/
var AgentHand = class {
	constructor(handedness) {
		this.handedness = handedness;
		this.root = new THREE.Group();
		this.loaded = false;
		this.bones = [];
		this.pose = SimulatorHandPose.RELAXED;
		this.targetQuaternion = new THREE.Quaternion();
		this.homePosition = new THREE.Vector3();
		this.homeCaptured = false;
		this.reachPosition = new THREE.Vector3();
		this.reaching = false;
		this.motionOffset = new THREE.Vector3();
		this.motionQuaternion = new THREE.Quaternion();
	}
	/**
	* Loads the hand mesh and collects its bones.
	* @param loader - Optional GLTFLoader to reuse.
	*/
	async load(loader = new GLTFLoader()) {
		loader.setPath(AGENT_HAND_PROFILE_PATH);
		const file = this.handedness === Handedness.LEFT ? "left.glb" : "right.glb";
		const gltf = await loader.loadAsync(file);
		this.root.add(gltf.scene);
		for (const name of HAND_JOINT_NAMES) this.bones.push(gltf.scene.getObjectByName(name));
		applyAgentHandAppearance(gltf.scene);
		this.loaded = true;
	}
	/** Sets the gesture the hand animates toward. */
	setPose(pose) {
		this.pose = pose;
	}
	/** The gesture the hand is currently animating toward. */
	get currentPose() {
		return this.pose;
	}
	/**
	* Advances the hand one animation step toward its current pose.
	* @param lerp - Interpolation factor in [0, 1].
	*/
	animate(lerp = .2) {
		if (!this.loaded) return;
		const joints = resolveSimulatorHandPoseRotations(this.handedness, SIMULATOR_HAND_POSE_ROTATIONS[this.pose]);
		lerpBonesToJoints(this.bones, joints, lerp);
		if (!this.homeCaptured) {
			this.homePosition.copy(this.root.position);
			this.reachPosition.copy(this.homePosition);
			this.homeCaptured = true;
		}
		const base = this.reaching ? this.reachPosition : this.homePosition;
		scratchGoal.copy(base).add(this.motionOffset);
		this.root.position.lerp(scratchGoal, lerp);
		scratchGoalQuat.copy(this.targetQuaternion).multiply(this.motionQuaternion);
		this.root.quaternion.slerp(scratchGoalQuat, lerp);
	}
	/**
	* Orients the hand so its index finger points at a world-space position,
	* reaches partway toward it, and switches to the pointing pose. The hand
	* smoothly turns and extends toward the target on subsequent
	* {@link animate} calls.
	* @param targetWorld - The world-space point to aim the index finger at.
	*/
	aimAt(targetWorld) {
		const parent = this.root.parent;
		if (!this.loaded || !parent) return;
		this.setPose(SimulatorHandPose.POINTING);
		this.captureHome_();
		parent.worldToLocal(scratchTarget.copy(targetWorld));
		scratchDir.copy(scratchTarget).sub(this.homePosition);
		const distance = scratchDir.length();
		if (distance > 1e-4) {
			const reach = Math.max(0, Math.min(REACH_FRACTION * distance, MAX_REACH, distance - MIN_STANDOFF));
			scratchDir.multiplyScalar(reach / distance);
		} else scratchDir.set(0, 0, 0);
		this.reachPosition.copy(this.homePosition).add(scratchDir);
		this.reaching = true;
		const wrist = this.bones[WRIST_BONE_INDEX];
		if (wrist) {
			wrist.getWorldPosition(scratchPivot);
			parent.worldToLocal(scratchPivot);
		} else scratchPivot.copy(this.reachPosition);
		const localDir = this.measurePointDirection_();
		scratchDir.copy(scratchTarget).sub(scratchPivot);
		if (scratchDir.lengthSq() < MIN_AIM_DISTANCE * MIN_AIM_DISTANCE) return;
		scratchDir.normalize();
		this.targetQuaternion.setFromUnitVectors(localDir, scratchDir);
	}
	/** Returns the hand to its resting position and orientation. */
	clearAim() {
		this.targetQuaternion.identity();
		this.reaching = false;
	}
	/**
	* Orients the hand toward an explicit parent-frame quaternion and stops
	* reaching, e.g. to present an emblematic gesture (thumbs up, victory)
	* upright by cancelling a resting tilt baked into the parent container.
	* Persists until {@link clearAim} or a subsequent {@link aimAt}/orient call.
	* @param parentQuaternion - Target orientation in the root's parent frame.
	*/
	orient(parentQuaternion) {
		this.targetQuaternion.copy(parentQuaternion);
		this.reaching = false;
	}
	/**
	* Writes the world-space position of the index fingertip into `out` (falls
	* back to the hand root if the bone is missing). Useful for drawing a pointer
	* ray from the fingertip.
	* @param out - Vector to write into.
	* @returns The same `out` vector.
	*/
	getIndexTipWorld(out = new THREE.Vector3()) {
		const tip = this.bones[INDEX_TIP_BONE_INDEX];
		if (tip) tip.getWorldPosition(out);
		else this.root.getWorldPosition(out);
		return out;
	}
	captureHome_() {
		if (this.homeCaptured) return;
		this.homePosition.copy(this.root.position);
		this.reachPosition.copy(this.homePosition);
		this.homeCaptured = true;
	}
	measurePointDirection_() {
		const parent = this.root.parent;
		const savedQuaternion = scratchQuaternionB.copy(this.root.quaternion);
		this.root.quaternion.identity();
		const pointingJoints = resolveSimulatorHandPoseRotations(this.handedness, SIMULATOR_HAND_POSE_ROTATIONS[SimulatorHandPose.POINTING]);
		lerpBonesToJoints(this.bones, pointingJoints, 1);
		this.root.updateWorldMatrix(true, true);
		const wrist = this.bones[WRIST_BONE_INDEX];
		const tip = this.bones[INDEX_TIP_BONE_INDEX];
		if (!wrist || !tip) {
			this.root.quaternion.copy(savedQuaternion);
			return scratchDirB.set(0, 0, -1);
		}
		wrist.getWorldPosition(scratchWrist);
		tip.getWorldPosition(scratchTip);
		this.root.quaternion.copy(savedQuaternion);
		parent.worldToLocal(scratchWrist);
		parent.worldToLocal(scratchTip);
		return scratchDirB.copy(scratchTip).sub(scratchWrist).normalize();
	}
};
//#endregion
export { AGENT_HAND_PROFILE_PATH, AgentHand, applyAgentHandAppearance, lerpBonesToJoints };
