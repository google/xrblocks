import * as THREE from "three";
import { SimulatorHandPose } from "xrblocks";
//#region src/addons/agenthands/AgentGestureAnimator.ts
const scratch = new THREE.Vector3();
const SIZE_SMALL_M = .18;
const SIZE_BIG_M = .55;
const SIZE_DEFAULT_M = .35;
const SIZE_MIN_M = .1;
const SIZE_MAX_M = .8;
/**
* Drives an {@link AgentHands} pair from timed {@link GestureStep}s: plays
* poses, motions, and points, and tracks which hand is currently pointing (and
* at what) so the app can drive a pointer visualization or the agent's gaze.
* This is the "gesture animator": it turns steps into hand movement and owns no
* timing of its own (the caller schedules when each step fires).
*/
var AgentGestureAnimator = class {
	/** @param hands - The hand pair to drive. */
	constructor(hands) {
		this.hands = hands;
		this.pointing = false;
		this.target = null;
		this.activeHand = null;
	}
	/**
	* Plays one gesture step: a point, a motion, or a static pose. A point step
	* aims a hand; any other step first stops pointing so the per-frame re-aim
	* does not fight the new pose.
	* @param step - The step to play.
	*/
	fireStep(step) {
		if (step.point) {
			this.pointAt(step.point);
			return;
		}
		this.stopPointing();
		if (step.motion) {
			this.hands.clearOrientation();
			this.playMotion(step.motion, step.param);
			if (step.motion === "wave") this.hands.gesture(SimulatorHandPose.NEUTRAL, "right");
		} else if (step.pose) {
			this.hands.gesture(step.pose);
			this.hands.clearOrientation();
		}
	}
	/**
	* Dispatches a motion gesture to the hands.
	* @param motion - The motion kind.
	* @param param - Optional parameter (size word/number, or count).
	*/
	playMotion(motion, param) {
		if (motion === "beat") this.hands.beat();
		else if (motion === "wave") this.hands.wave();
		else if (motion === "size") this.hands.showSize(this.sizeWidth(param));
		else if (motion === "count") this.hands.showCount(parseInt(param ?? "", 10) || 1);
	}
	/**
	* Maps a size word/number to a separation between the hands, in metres.
	* @param param - `small`, `big`/`large`, or a number (clamped to 0.1..0.8).
	* @returns The separation width in metres.
	*/
	sizeWidth(param) {
		if (param === "small") return SIZE_SMALL_M;
		if (param === "big" || param === "large") return SIZE_BIG_M;
		const n = parseFloat(param ?? "");
		return Number.isFinite(n) ? THREE.MathUtils.clamp(n, SIZE_MIN_M, SIZE_MAX_M) : SIZE_DEFAULT_M;
	}
	/**
	* Points a hand at a world point and records the pointing state (which hand,
	* and the target) for the caller's pointer viz / gaze.
	* @param point - The world-space point to aim at.
	*/
	pointAt(point) {
		this.hands.pointAt(point);
		this.pointing = true;
		this.target = point;
		this.hands.worldToLocal(scratch.copy(point));
		this.activeHand = scratch.x >= 0 ? this.hands.right : this.hands.left;
	}
	/**
	* Re-aims the pointing hand at the current target. Call once per frame while
	* the rig moves (e.g. head-anchored) so the finger stays locked on.
	*/
	reaim() {
		if (this.pointing && this.activeHand && this.target) this.activeHand.aimAt(this.target);
	}
	/** Relaxes both hands and clears the pointing state. */
	rest() {
		this.hands.rest();
		this.stopPointing();
	}
	/** Clears the pointing state without moving the hands. */
	stopPointing() {
		this.pointing = false;
		this.target = null;
		this.activeHand = null;
	}
};
//#endregion
export { AgentGestureAnimator };
