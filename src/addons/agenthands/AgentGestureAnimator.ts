import * as THREE from 'three';
import {SimulatorHandPose} from 'xrblocks';

import type {AgentHand} from './AgentHand';
import type {AgentHands} from './AgentHands';
import type {AgentMotionKind, GestureStep} from './AgentGestures';

const scratch = new THREE.Vector3();

// Iconic-size gesture widths, in metres: the hand separation used to depict a
// "small" versus a "big" thing, the fallback when no size word is given, and
// the clamp range for an explicit numeric size.
const SIZE_SMALL_M = 0.18;
const SIZE_BIG_M = 0.55;
const SIZE_DEFAULT_M = 0.35;
const SIZE_MIN_M = 0.1;
const SIZE_MAX_M = 0.8;

/**
 * Drives an {@link AgentHands} pair from timed {@link GestureStep}s: plays
 * poses, motions, and points, and tracks which hand is currently pointing (and
 * at what) so the app can drive a pointer visualization or the agent's gaze.
 * This is the "gesture animator": it turns steps into hand movement and owns no
 * timing of its own (the caller schedules when each step fires).
 */
export class AgentGestureAnimator {
  /** Whether a hand is currently pointing at a world target. */
  pointing = false;
  /** The world-space point being pointed at, or null. */
  target: THREE.Vector3 | null = null;
  /** The hand doing the pointing, or null. */
  activeHand: AgentHand | null = null;

  /** @param hands - The hand pair to drive. */
  constructor(private readonly hands: AgentHands) {}

  /**
   * Plays one gesture step: a point, a motion, or a static pose. A point step
   * aims a hand; any other step first stops pointing so the per-frame re-aim
   * does not fight the new pose.
   * @param step - The step to play.
   */
  fireStep(step: GestureStep) {
    if (step.point) {
      this.pointAt(step.point);
      return;
    }
    this.stopPointing();
    if (step.motion) {
      this.hands.clearOrientation();
      this.playMotion(step.motion, step.param);
      // A wave reads better with flat, open fingers; the wave's RELAXED pose
      // curls them slightly.
      if (step.motion === 'wave') {
        this.hands.gesture(SimulatorHandPose.NEUTRAL, 'right');
      }
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
  playMotion(motion: AgentMotionKind, param?: string) {
    if (motion === 'beat') this.hands.beat();
    else if (motion === 'wave') this.hands.wave();
    else if (motion === 'size') this.hands.showSize(this.sizeWidth(param));
    else if (motion === 'count') {
      this.hands.showCount(parseInt(param ?? '', 10) || 1);
    }
  }

  /**
   * Maps a size word/number to a separation between the hands, in metres.
   * @param param - `small`, `big`/`large`, or a number (clamped to 0.1..0.8).
   * @returns The separation width in metres.
   */
  sizeWidth(param?: string): number {
    if (param === 'small') return SIZE_SMALL_M;
    if (param === 'big' || param === 'large') return SIZE_BIG_M;
    const n = parseFloat(param ?? '');
    return Number.isFinite(n)
      ? THREE.MathUtils.clamp(n, SIZE_MIN_M, SIZE_MAX_M)
      : SIZE_DEFAULT_M;
  }

  /**
   * Points a hand at a world point and records the pointing state (which hand,
   * and the target) for the caller's pointer viz / gaze.
   * @param point - The world-space point to aim at.
   */
  pointAt(point: THREE.Vector3) {
    this.hands.pointAt(point);
    this.pointing = true;
    this.target = point;
    // pointAt picks a hand by local x; mirror that choice for the caller.
    this.hands.worldToLocal(scratch.copy(point));
    this.activeHand = scratch.x >= 0 ? this.hands.right : this.hands.left;
  }

  /**
   * Re-aims the pointing hand at the current target. Call once per frame while
   * the rig moves (e.g. head-anchored) so the finger stays locked on.
   */
  reaim() {
    if (this.pointing && this.activeHand && this.target) {
      this.activeHand.aimAt(this.target);
    }
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
}
