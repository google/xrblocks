/**
* Copyright 2025 Google LLC
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
*     http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*
* @file xrblocks.js
* @version v0.21.1
* @commitid 3e58b1b
* @builddate 2026-09-28T19:57:25.178Z
* @description XR Blocks SDK, built from source with the above commit ID.
* @agent When using with Gemini to create XR apps, use **Gemini Canvas** mode,
* and follow rules below:
* 1. Include the following importmap for maximum compatibility:
"three": "https://cdn.jsdelivr.net/npm/three@0.186.0/build/three.module.js",
"three/addons/": "https://cdn.jsdelivr.net/npm/three@0.186.0/examples/jsm/",
"@pmndrs/uikit": "https://cdn.jsdelivr.net/npm/@pmndrs/uikit@1.0.64/dist/index.min.js",
"@pmndrs/uikit-pub-sub": "https://cdn.jsdelivr.net/npm/@pmndrs/uikit-pub-sub@1.0.64/dist/index.min.js",
"@pmndrs/msdfonts": "https://cdn.jsdelivr.net/npm/@pmndrs/msdfonts@1.0.64/dist/index.min.js",
"@preact/signals-core": "https://cdn.jsdelivr.net/npm/@preact/signals-core@1.14.0/dist/signals-core.mjs",
"yoga-layout/load": "https://cdn.jsdelivr.net/npm/yoga-layout@3.2.1/dist/src/load.js",
"lit": "https://esm.sh/lit@3.3.1",
"lit/": "https://esm.sh/lit@3.3.1/",
"three-pathfinding": "https://cdn.jsdelivr.net/npm/three-pathfinding@1.3.0/dist/three-pathfinding.module.js",
2. If the app focus on standalone objects, spawn it in front of the user in
WebXR and rescale to reasonable physical size. Wrap them with xb.ModelViewer
and make sure users can drag the platform to move it around in XR.
3. When rendering a large scene, remember users may navigate the scene in a
physical world space, also add locomotion methods like pinch to teleport.
4. Do not halluciate mode files --- use either public high-quality assets,
or generate from primitive shapes of use vox formats for voxels or
lego-styles.
*/
import { d as XR_BLOCKS_ASSETS_PATH } from "./constants.js";
//#region src/utils/OptionsUtils.ts
/**
* Recursively freezes an object and all its nested properties, making them
* immutable. This prevents any future changes to the object or its sub-objects.
* @param obj - The object to freeze deeply.
* @returns The same object that was passed in, now deeply frozen.
*/
function deepFreeze(obj) {
	Object.freeze(obj);
	Object.getOwnPropertyNames(obj).forEach((name) => {
		const prop = obj[name];
		if (prop && typeof prop === "object" && !Object.isFrozen(prop)) deepFreeze(prop);
	});
	return obj;
}
/**
* Recursively merges properties from `obj2` into `obj1`.
* If a property exists in both objects and is an object itself, it will be
* recursively merged. Otherwise, the value from `obj2` will overwrite the
* value in `obj1`.
* @param obj1 - The target object to merge into.
* @param obj2 - The source object to merge from.
*/
function deepMerge(obj1, obj2) {
	if (obj2 == null) return obj1;
	const merged = obj1;
	for (const key in obj2) if (Object.hasOwn(obj2, key) && key !== "__proto__" && key !== "constructor" && key !== "prototype") {
		const val1 = merged[key];
		const val2 = obj2[key];
		if (val1 && typeof val1 === "object" && val2 && typeof val2 === "object") deepMerge(val1, val2);
		else if (val2 && typeof val2 === "object") {
			const clone = Array.isArray(val2) ? [] : {};
			deepMerge(clone, val2);
			merged[key] = clone;
		} else merged[key] = val2;
	}
}
//#endregion
//#region src/input/components/HandJointNames.ts
const HAND_JOINT_NAMES = [
	"wrist",
	"thumb-metacarpal",
	"thumb-phalanx-proximal",
	"thumb-phalanx-distal",
	"thumb-tip",
	"index-finger-metacarpal",
	"index-finger-phalanx-proximal",
	"index-finger-phalanx-intermediate",
	"index-finger-phalanx-distal",
	"index-finger-tip",
	"middle-finger-metacarpal",
	"middle-finger-phalanx-proximal",
	"middle-finger-phalanx-intermediate",
	"middle-finger-phalanx-distal",
	"middle-finger-tip",
	"ring-finger-metacarpal",
	"ring-finger-phalanx-proximal",
	"ring-finger-phalanx-intermediate",
	"ring-finger-phalanx-distal",
	"ring-finger-tip",
	"pinky-finger-metacarpal",
	"pinky-finger-phalanx-proximal",
	"pinky-finger-phalanx-intermediate",
	"pinky-finger-phalanx-distal",
	"pinky-finger-tip"
];
//#endregion
//#region src/input/Hands.ts
/**
* Utility class for managing WebXR hand tracking data based on
* reported Handedness.
*/
/**
* Enum for handedness, using WebXR standard strings.
*/
let Handedness = /* @__PURE__ */ function(Handedness) {
	Handedness[Handedness["NONE"] = -1] = "NONE";
	Handedness[Handedness["LEFT"] = 0] = "LEFT";
	Handedness[Handedness["RIGHT"] = 1] = "RIGHT";
	return Handedness;
}({});
/**
* Represents and provides access to WebXR hand tracking data.
* Uses the 'handedness' property of input hands for identification.
*/
var Hands = class {
	/**
	* @param hands - An array containing XRHandSpace objects from Three.js.
	*/
	constructor(hands) {
		this.hands = hands;
		this.dominant = 1;
	}
	/**
	* Retrieves a specific joint object for a given hand.
	* @param jointName - The name of the joint to retrieve (e.g.,
	*     'index-finger-tip').
	* @param targetHandednessEnum - The hand enum value
	*     (Handedness.LEFT or Handedness.RIGHT)
	*        to retrieve the joint from. If Handedness.NONE, uses the dominant
	* hand.
	* @returns The requested joint object, or null if not
	*     found or invalid input.
	*/
	getJoint(jointName, targetHandednessEnum) {
		let resolvedHandednessEnum = targetHandednessEnum;
		if (resolvedHandednessEnum === -1) resolvedHandednessEnum = this.dominant;
		const hand = this.hands[resolvedHandednessEnum];
		if (!hand) {
			console.log("no hand");
			return;
		}
		if (!hand.joints || !(jointName in hand.joints)) return;
		return hand.joints[jointName];
	}
	/**
	* Gets the index finger tip joint.
	* @param handedness - Optional handedness
	*     ('left'/'right'),
	* defaults to NONE (uses dominant hand).
	* @returns The joint object or null.
	*/
	getIndexTip(handedness = -1) {
		return this.getJoint("index-finger-tip", handedness);
	}
	/**
	* Gets the thumb tip joint.
	* @param handedness - Optional handedness
	*     ('left'/'right'),
	* defaults to NONE (uses dominant hand).
	* @returns The joint object or null.
	*/
	getThumbTip(handedness = -1) {
		return this.getJoint("thumb-tip", handedness);
	}
	/**
	* Gets the middle finger tip joint.
	* @param handedness - Optional handedness
	*     ('left'/'right'),
	* defaults to NONE (uses dominant hand).
	* @returns The joint object or null.
	*/
	getMiddleTip(handedness = -1) {
		return this.getJoint("middle-finger-tip", handedness);
	}
	/**
	* Gets the ring finger tip joint.
	* @param handedness - Optional handedness
	*     ('left'/'right'),
	* defaults to NONE (uses dominant hand).
	* @returns The joint object or null.
	*/
	getRingTip(handedness = -1) {
		return this.getJoint("ring-finger-tip", handedness);
	}
	/**
	* Gets the pinky finger tip joint.
	* @param handedness - Optional handedness
	*     ('left'/'right'),
	* defaults to NONE (uses dominant hand).
	* @returns The joint object or null.
	*/
	getPinkyTip(handedness = -1) {
		return this.getJoint("pinky-finger-tip", handedness);
	}
	/**
	* Gets the wrist joint.
	* @param handedness - Optional handedness enum value
	*     (LEFT/RIGHT/NONE),
	* defaults to NONE (uses dominant hand).
	* @returns The joint object or null.
	*/
	getWrist(handedness = -1) {
		return this.getJoint("wrist", handedness);
	}
	/**
	* Generates a string representation of the hand joint data for both hands.
	* Always lists LEFT hand data first, then RIGHT hand data, if available.
	* @returns A string containing position data for all available
	* joints.
	*/
	toString() {
		let s = "";
		[0, 1].forEach((handedness) => {
			const hand = this.hands[handedness];
			if (!hand || !hand.joints) {
				s += `${handedness} Hand: Data unavailable\n`;
				return;
			}
			HAND_JOINT_NAMES.forEach((jointName) => {
				const joint = hand.joints[jointName];
				if (joint) {
					if (joint.position) s += `${handedness} - ${jointName}: ${joint.position.x.toFixed(3)}, ${joint.position.y.toFixed(3)}, ${joint.position.z.toFixed(3)}\n`;
					else s += `${handedness} - ${jointName}: Position unavailable\n`;
				} else s += `${handedness} - ${jointName}: Joint unavailable\n`;
			});
		});
		return s;
	}
	/**
	* Converts the pose data (position and quaternion) of all joints for both
	* hands into a single flat array. Each joint is represented by 7 numbers
	* (3 for position, 4 for quaternion). Missing joints or hands are represented
	* by zeros. Ensures a consistent output order: all left hand joints first,
	* then all right hand joints.
	* @returns A flat array containing position (x, y, z) and
	* quaternion (x, y, z, w) data for all joints, ordered [left...,
	* right...]. Size is always 2 * HAND_JOINT_NAMES.length * 7.
	*/
	toPositionQuaternionArray() {
		const data = [];
		const orderedHandedness = [0, 1];
		const numJoints = HAND_JOINT_NAMES.length;
		const numValuesPerJoint = 7;
		orderedHandedness.forEach((handedness) => {
			const hand = this.hands[handedness];
			const handDataAvailable = hand && hand.joints;
			HAND_JOINT_NAMES.forEach((jointName) => {
				const joint = handDataAvailable ? hand.joints[jointName] : null;
				if (joint && joint.position && joint.quaternion) {
					data.push(joint.position.x, joint.position.y, joint.position.z);
					data.push(joint.quaternion.x, joint.quaternion.y, joint.quaternion.z, joint.quaternion.w);
				} else for (let i = 0; i < numValuesPerJoint; i++) data.push(0);
			});
		});
		const expectedSize = orderedHandedness.length * numJoints * numValuesPerJoint;
		if (data.length !== expectedSize) {
			console.error(`XRHands.toPositionQuaternionArray: Output array size mismatch. Expected ${expectedSize}, got ${data.length}. Padding with zeros.`);
			while (data.length < expectedSize) data.push(0);
		}
		return data;
	}
	/**
	* Checks for the availability of hand data.
	* If an integer (0 for LEFT, 1 for RIGHT) is provided, it checks for that
	* specific hand. If no integer is provided, it checks that data for *both*
	* hands is available.
	* @param handIndex - Optional. The index of the hand to validate
	*     (0 or 1).
	* @returns `true` if the specified hand(s) have data, `false`
	*     otherwise.
	*/
	isValid(handIndex) {
		if (!this.hands || !Array.isArray(this.hands) || this.hands.length !== 2) return false;
		if (handIndex === 0 || handIndex === 1) return !!this.hands[handIndex];
		return !!this.hands[0] && !!this.hands[1];
	}
};
//#endregion
//#region src/utils/Keycodes.ts
/**
* A frozen object containing standardized string values for `event.code`.
* Used for desktop simulation.
*/
let Keycodes = /* @__PURE__ */ function(Keycodes) {
	Keycodes["W_CODE"] = "KeyW";
	Keycodes["A_CODE"] = "KeyA";
	Keycodes["S_CODE"] = "KeyS";
	Keycodes["D_CODE"] = "KeyD";
	Keycodes["UP"] = "ArrowUp";
	Keycodes["DOWN"] = "ArrowDown";
	Keycodes["LEFT"] = "ArrowLeft";
	Keycodes["RIGHT"] = "ArrowRight";
	Keycodes["Q_CODE"] = "KeyQ";
	Keycodes["E_CODE"] = "KeyE";
	Keycodes["PAGE_UP"] = "PageUp";
	Keycodes["PAGE_DOWN"] = "PageDown";
	Keycodes["SPACE_CODE"] = "Space";
	Keycodes["ENTER_CODE"] = "Enter";
	Keycodes["T_CODE"] = "KeyT";
	Keycodes["LEFT_SHIFT_CODE"] = "ShiftLeft";
	Keycodes["RIGHT_SHIFT_CODE"] = "ShiftRight";
	Keycodes["LEFT_CTRL_CODE"] = "ControlLeft";
	Keycodes["RIGHT_CTRL_CODE"] = "ControlRight";
	Keycodes["LEFT_ALT_CODE"] = "AltLeft";
	Keycodes["RIGHT_ALT_CODE"] = "AltRight";
	Keycodes["CAPS_LOCK_CODE"] = "CapsLock";
	Keycodes["ESCAPE_CODE"] = "Escape";
	Keycodes["TAB_CODE"] = "Tab";
	Keycodes["B_CODE"] = "KeyB";
	Keycodes["C_CODE"] = "KeyC";
	Keycodes["F_CODE"] = "KeyF";
	Keycodes["G_CODE"] = "KeyG";
	Keycodes["H_CODE"] = "KeyH";
	Keycodes["I_CODE"] = "KeyI";
	Keycodes["J_CODE"] = "KeyJ";
	Keycodes["K_CODE"] = "KeyK";
	Keycodes["L_CODE"] = "KeyL";
	Keycodes["M_CODE"] = "KeyM";
	Keycodes["N_CODE"] = "KeyN";
	Keycodes["O_CODE"] = "KeyO";
	Keycodes["P_CODE"] = "KeyP";
	Keycodes["R_CODE"] = "KeyR";
	Keycodes["U_CODE"] = "KeyU";
	Keycodes["V_CODE"] = "KeyV";
	Keycodes["X_CODE"] = "KeyX";
	Keycodes["Y_CODE"] = "KeyY";
	Keycodes["Z_CODE"] = "KeyZ";
	Keycodes["DIGIT_0"] = "Digit0";
	Keycodes["DIGIT_1"] = "Digit1";
	Keycodes["DIGIT_2"] = "Digit2";
	Keycodes["DIGIT_3"] = "Digit3";
	Keycodes["DIGIT_4"] = "Digit4";
	Keycodes["DIGIT_5"] = "Digit5";
	Keycodes["DIGIT_6"] = "Digit6";
	Keycodes["DIGIT_7"] = "Digit7";
	Keycodes["DIGIT_8"] = "Digit8";
	Keycodes["DIGIT_9"] = "Digit9";
	Keycodes["BACKQUOTE"] = "Backquote";
	return Keycodes;
}({});
//#endregion
//#region src/simulator/DefaultManifests.ts
const SIMULATOR_SCENES_PATH = `${XR_BLOCKS_ASSETS_PATH}simulator/scenes/`;
const DEFAULT_MANIFESTS = [
	{
		name: "Living Room",
		scenePath: `${SIMULATOR_SCENES_PATH}XREmulatorsceneV5_livingRoom.glb`,
		scenePlanesPath: `${SIMULATOR_SCENES_PATH}XREmulatorsceneV5_livingRoom_planes.json`,
		navMeshPath: `${SIMULATOR_SCENES_PATH}XREmulatorsceneV5_livingRoom_navmesh.glb`,
		position: [
			-1.6,
			.3,
			0
		],
		locations: {
			start: {
				description: "Open starting position on the navmesh.",
				position: [
					-.51,
					1.8,
					-.79
				]
			},
			"wall-view": {
				description: "Viewpoint with both named wall points visible.",
				position: [
					.5,
					1.8,
					.85
				]
			},
			"wall-primary": {
				description: "Primary wall interaction point.",
				position: [
					-.25,
					1.47,
					3.37
				]
			},
			"wall-secondary": {
				description: "Secondary wall interaction point.",
				position: [
					-2.2,
					1.51,
					1.43
				]
			},
			"table-view": {
				description: "Viewpoint within reach of both named table points.",
				position: [
					-.76,
					1.8,
					-.76
				]
			},
			"table-primary": {
				description: "Primary table interaction point.",
				position: [
					-.16,
					.79,
					-.93
				]
			},
			"table-secondary": {
				description: "Secondary table interaction point.",
				position: [
					.42,
					.79,
					-1.11
				]
			},
			"floor-primary": {
				description: "Primary coordinate in a clear floor area.",
				position: [
					-1.38,
					1.8,
					-2.98
				]
			},
			"floor-secondary": {
				description: "Secondary coordinate in a clear floor area.",
				position: [
					.88,
					1.8,
					-2.33
				]
			},
			"floor-near-obstacle": {
				description: "Floor coordinate near a fixed obstacle.",
				position: [
					-1.86,
					.3,
					-1.03
				]
			},
			"occlusion-target": {
				description: "Target hidden from the blocked view and visible from the clear view.",
				position: [
					.17,
					1.8,
					-3.79
				]
			},
			"occlusion-view-blocked": {
				description: "Viewpoint where the occlusion target is blocked.",
				position: [
					.32,
					1.8,
					-2.06
				]
			},
			"occlusion-view-clear": {
				description: "Viewpoint where the occlusion target is visible.",
				position: [
					-2.01,
					1.8,
					-3.79
				]
			}
		},
		objects: []
	},
	{
		name: "Office",
		scenePath: `${SIMULATOR_SCENES_PATH}XREmulatorsceneV5_office.glb`,
		scenePlanesPath: `${SIMULATOR_SCENES_PATH}XREmulatorsceneV5_office_planes.json`,
		navMeshPath: `${SIMULATOR_SCENES_PATH}XREmulatorsceneV5_office_navmesh.glb`,
		position: [
			3,
			.3,
			-2
		],
		locations: {
			start: {
				description: "Open starting position on the navmesh.",
				position: [
					-.51,
					1.8,
					-.79
				]
			},
			"wall-view": {
				description: "Viewpoint with both named wall points visible.",
				position: [
					1.23,
					1.97,
					-.53
				]
			},
			"wall-primary": {
				description: "Primary wall interaction point.",
				position: [
					-1.25,
					1.68,
					-1.13
				]
			},
			"wall-secondary": {
				description: "Secondary wall interaction point.",
				position: [
					.61,
					1.63,
					-3.23
				]
			},
			"table-view": {
				description: "Viewpoint within reach of both named table points.",
				position: [
					.35,
					1.97,
					-2.19
				]
			},
			"table-primary": {
				description: "Primary table interaction point.",
				position: [
					.46,
					1.05,
					-2.7
				]
			},
			"table-secondary": {
				description: "Secondary table interaction point.",
				position: [
					1.44,
					1.05,
					-2.63
				]
			},
			"floor-primary": {
				description: "Primary coordinate in a clear floor area.",
				position: [
					-.88,
					1.97,
					-1.57
				]
			},
			"floor-secondary": {
				description: "Secondary coordinate in a clear floor area.",
				position: [
					-.18,
					1.97,
					.48
				]
			},
			"floor-near-obstacle": {
				description: "Floor coordinate near a fixed obstacle.",
				position: [
					1.7,
					1.97,
					.3
				]
			},
			"occlusion-target": {
				description: "Target hidden from the blocked view and visible from the clear view.",
				position: [
					-.83,
					.35,
					-2.87
				]
			},
			"occlusion-view-blocked": {
				description: "Viewpoint where the occlusion target is blocked.",
				position: [
					1.75,
					1.97,
					-1.72
				]
			},
			"occlusion-view-clear": {
				description: "Viewpoint where the occlusion target is visible.",
				position: [
					-1,
					.31,
					-1.12
				]
			}
		},
		objects: []
	},
	{
		name: "Daytime Loft",
		scenePath: `${SIMULATOR_SCENES_PATH}XREmulatorsceneV5.glb`,
		scenePlanesPath: `${SIMULATOR_SCENES_PATH}XREmulatorsceneV5_planes.json`,
		navMeshPath: `${SIMULATOR_SCENES_PATH}XREmulatorsceneV5_navmesh.glb`,
		position: [
			-1.6,
			.3,
			0
		],
		objects: []
	},
	{
		name: "Evening Loft",
		scenePath: `${SIMULATOR_SCENES_PATH}XREmulatorscene_Dark.glb`,
		scenePlanesPath: `${SIMULATOR_SCENES_PATH}XREmulatorsceneV5_planes.json`,
		navMeshPath: `${SIMULATOR_SCENES_PATH}XREmulatorsceneV5_navmesh.glb`,
		position: [
			-1.6,
			.3,
			0
		],
		objects: []
	}
];
function toDataUrl(manifest) {
	return `data:application/json,${encodeURIComponent(JSON.stringify(manifest))}`;
}
const DEFAULT_ENVIRONMENTS = DEFAULT_MANIFESTS.map((manifest) => ({
	name: manifest.name,
	manifestPath: toDataUrl(manifest)
}));
//#endregion
//#region src/simulator/SimulatorOptions.ts
let SimulatorMode = /* @__PURE__ */ function(SimulatorMode) {
	SimulatorMode["USER"] = "User";
	SimulatorMode["POSE"] = "Navigation";
	SimulatorMode["CONTROLLER"] = "Hands";
	SimulatorMode["POINTER_LOCK"] = "PointerLock";
	SimulatorMode["EDITOR"] = "Editor";
	return SimulatorMode;
}({});
const DEFAULT_MODE_TOGGLE_ORDER = {
	["User"]: "Navigation",
	["Navigation"]: "Hands",
	["Hands"]: "PointerLock",
	["PointerLock"]: "Editor",
	["Editor"]: "User"
};
var SimulatorOptions = class {
	constructor(options) {
		this.initialCameraPosition = {
			x: 0,
			y: 1.5,
			z: 0
		};
		this.environments = DEFAULT_ENVIRONMENTS.map((environment) => ({ ...environment }));
		this.activeEnvironmentIndex = 0;
		this.defaultMode = "User";
		this.defaultHand = 0;
		this.modeToggle = {
			enabled: false,
			toggleKey: "ShiftLeft",
			toggleOrder: DEFAULT_MODE_TOGGLE_ORDER
		};
		this.simulatorSettingsPanel = {
			enabled: true,
			element: "xrblocks-simulator-settings"
		};
		this.instructions = {
			enabled: true,
			showAutomatically: false,
			element: "xrblocks-simulator-instructions",
			customInstructions: []
		};
		this.handPosePanel = {
			enabled: true,
			element: "xrblocks-simulator-hand-pose-panel"
		};
		this.geminiLivePanel = {
			enabled: false,
			element: "xrblocks-simulator-geminilive"
		};
		this.stereo = { enabled: false };
		this.navMesh = {
			enabled: false,
			showDebugVisualizations: false,
			eyeHeight: 1.5
		};
		this.physics = { enabled: true };
		this.deviceCamera = { enabled: true };
		this.renderToRenderTexture = true;
		this.blendingMode = "normal";
		this.leftHandOrigin = {
			x: -.2,
			y: -.2,
			z: 0
		};
		this.rightHandOrigin = {
			x: .2,
			y: -.2,
			z: 0
		};
		this.handPhysics = {
			enabled: false,
			radius: .075,
			mass: 1,
			contactOffset: .002,
			friction: .8,
			restitution: 0
		};
		this.reachDistance = {
			enabled: false,
			/** The maximum distance in meters a controller can move from its origin point. */
			radius: .75
		};
		this.reachAngle = {
			enabled: false,
			/** The maximum full cone angle in radians around the camera's forward direction (default is Math.PI, a front hemisphere). */
			angle: Math.PI
		};
		deepMerge(this, options);
	}
};
//#endregion
//#region src/simulator/events/SimulatorEnvironmentEvents.ts
var SetSimulatorEnvironmentEvent = class SetSimulatorEnvironmentEvent extends Event {
	static {
		this.type = "setSimulatorEnvironment";
	}
	constructor(environmentIndex) {
		super(SetSimulatorEnvironmentEvent.type, {
			bubbles: true,
			composed: true
		});
		this.environmentIndex = environmentIndex;
	}
};
//#endregion
//#region src/simulator/events/SimulatorHandEvents.ts
var SimulatorHandPoseChangeRequestEvent = class SimulatorHandPoseChangeRequestEvent extends Event {
	static {
		this.type = "SimulatorHandPoseChangeRequestEvent";
	}
	constructor(pose) {
		super(SimulatorHandPoseChangeRequestEvent.type, {
			bubbles: true,
			composed: true
		});
		this.pose = pose;
	}
};
//#endregion
//#region src/simulator/events/SimulatorModeEvents.ts
var SetSimulatorModeEvent = class SetSimulatorModeEvent extends Event {
	static {
		this.type = "setSimulatorMode";
	}
	constructor(simulatorMode) {
		super(SetSimulatorModeEvent.type, {
			bubbles: true,
			composed: true
		});
		this.simulatorMode = simulatorMode;
	}
};
//#endregion
//#region src/simulator/events/SimulatorInstructionsEvents.ts
var ShowSimulatorInstructionsEvent = class ShowSimulatorInstructionsEvent extends Event {
	static {
		this.type = "showSimulatorInstructions";
	}
	constructor(simulatorMode) {
		super(ShowSimulatorInstructionsEvent.type, {
			bubbles: true,
			composed: true
		});
		this.simulatorMode = simulatorMode;
	}
};
//#endregion
//#region src/simulator/events/SimulatorPhysicsEvents.ts
var SetSimulatorHandPhysicsEvent = class SetSimulatorHandPhysicsEvent extends Event {
	static {
		this.type = "setSimulatorHandPhysics";
	}
	constructor(enabled) {
		super(SetSimulatorHandPhysicsEvent.type, {
			bubbles: true,
			composed: true
		});
		this.enabled = enabled;
	}
};
//#endregion
//#region src/simulator/handPoses/HandPoses.ts
let SimulatorHandPose = /* @__PURE__ */ function(SimulatorHandPose) {
	SimulatorHandPose["NEUTRAL"] = "neutral";
	SimulatorHandPose["RELAXED"] = "relaxed";
	SimulatorHandPose["PINCHING"] = "pinching";
	SimulatorHandPose["FIST"] = "fist";
	SimulatorHandPose["THUMBS_UP"] = "thumbs_up";
	SimulatorHandPose["POINTING"] = "pointing";
	SimulatorHandPose["ROCK"] = "rock";
	SimulatorHandPose["THUMBS_DOWN"] = "thumbs_down";
	SimulatorHandPose["VICTORY"] = "victory";
	return SimulatorHandPose;
}({});
const SIMULATOR_HAND_POSE_NAMES = Object.freeze({
	["neutral"]: "Neutral",
	["relaxed"]: "Relaxed",
	["pinching"]: "Pinching",
	["fist"]: "Fist",
	["thumbs_up"]: "Thumbs Up",
	["pointing"]: "Pointing",
	["rock"]: "Rock",
	["thumbs_down"]: "Thumbs Down",
	["victory"]: "Victory"
});
//#endregion
export { SetSimulatorModeEvent as a, SimulatorMode as c, Handedness as d, Hands as f, deepMerge as h, ShowSimulatorInstructionsEvent as i, SimulatorOptions as l, deepFreeze as m, SimulatorHandPose as n, SimulatorHandPoseChangeRequestEvent as o, HAND_JOINT_NAMES as p, SetSimulatorHandPhysicsEvent as r, SetSimulatorEnvironmentEvent as s, SIMULATOR_HAND_POSE_NAMES as t, Keycodes as u };

//# sourceMappingURL=HandPoses.js.map