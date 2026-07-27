import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {Handedness, Script, SimulatorHandPose} from 'xrblocks';

import {AgentHand} from './AgentHand';

const scratchHandsOrigin = new THREE.Vector3();
const scratchQuatInv = new THREE.Quaternion();
const scratchOffset = new THREE.Vector3();
const scratchAxis = new THREE.Vector3();
const scratchLeftPos = new THREE.Vector3();
const scratchRightPos = new THREE.Vector3();
const scratchSpread = new THREE.Vector3();

/** Which hand(s) a gesture applies to. */
export type AgentHandSelector = 'left' | 'right' | 'both';

interface TransientMotion {
  t: number;
  dur: number;
}

/**
 * A free-standing pair of agent hands that gesture in the scene. Owns a left
 * and right {@link AgentHand}, loads both, and animates them toward their
 * current poses every frame. Position/orient the whole pair by moving this
 * Script (it is a `THREE.Object3D`); the app decides where the hands sit
 * relative to the user.
 */
export class AgentHands extends Script {
  readonly left = new AgentHand(Handedness.LEFT);
  readonly right = new AgentHand(Handedness.RIGHT);

  /** Per-frame interpolation factor toward the target pose. */
  lerp = 0.2;

  /** Whether both hands have finished loading. */
  loaded = false;

  private beatMotion: (TransientMotion & {sel: AgentHandSelector}) | null =
    null;
  private waveMotion: (TransientMotion & {sel: AgentHandSelector}) | null =
    null;
  private sizeMotion: (TransientMotion & {width: number}) | null = null;
  private lastNowMs = 0;

  /**
   * Loads both hand meshes and parents them under this object.
   * @param loader - Optional shared GLTFLoader.
   */
  async load(loader = new GLTFLoader()): Promise<void> {
    await Promise.all([this.left.load(loader), this.right.load(loader)]);
    this.add(this.left.root, this.right.root);
    this.loaded = true;
  }

  /**
   * Sets the gesture one or both hands animate toward.
   * @param pose - The target hand pose.
   * @param hand - Which hand(s) to apply it to. Defaults to both.
   */
  gesture(pose: SimulatorHandPose, hand: AgentHandSelector = 'both') {
    if (hand !== 'right') this.left.setPose(pose);
    if (hand !== 'left') this.right.setPose(pose);
  }

  /**
   * Sets an explicit presentation orientation on one or both hands (parent
   * frame), e.g. to show an emblematic gesture upright. Cleared by {@link rest}.
   * @param parentQuaternion - Target orientation in each hand-root's parent.
   * @param hand - Which hand(s) to orient. Defaults to both.
   */
  orient(parentQuaternion: THREE.Quaternion, hand: AgentHandSelector = 'both') {
    if (hand !== 'right') this.left.orient(parentQuaternion);
    if (hand !== 'left') this.right.orient(parentQuaternion);
  }

  /** Clears any aim/orientation override, returning hands to the parent tilt. */
  clearOrientation(hand: AgentHandSelector = 'both') {
    if (hand !== 'right') this.left.clearAim();
    if (hand !== 'left') this.right.clearAim();
  }

  /** Relaxes both hands to a neutral resting pose. */
  rest() {
    this.gesture(SimulatorHandPose.RELAXED);
    this.left.clearAim();
    this.right.clearAim();
  }

  /**
   * Plays a beat gesture: a quick downward bob, the rhythmic emphasis that
   * accompanies stressed words in natural speech.
   * @param hand - Which hand(s) bob. Defaults to both.
   */
  beat(hand: AgentHandSelector = 'both') {
    this.beatMotion = {t: 0, dur: 0.4, sel: hand};
  }

  /**
   * Plays a wave gesture: the hand rises and oscillates side to side, e.g. a
   * greeting on "hi" or "hello".
   * @param hand - Which hand waves. Defaults to the right.
   */
  wave(hand: AgentHandSelector = 'right') {
    this.waveMotion = {t: 0, dur: 1.4, sel: hand};
    this.gesture(SimulatorHandPose.RELAXED, hand);
  }

  /**
   * Plays an iconic size gesture: the two hands spread apart to depict how big
   * something is, then return.
   * @param width - Peak separation added between the hands, in metres.
   */
  showSize(width = 0.4) {
    this.sizeMotion = {t: 0, dur: 1.6, width};
    this.gesture(SimulatorHandPose.RELAXED);
  }

  /**
   * Holds up a number of fingers (a deictic/enumerative gesture). The rig's
   * pose library supports one and two cleanly; larger counts show an open hand.
   * @param n - How many to indicate.
   */
  showCount(n: number) {
    const pose =
      n <= 1
        ? SimulatorHandPose.POINTING
        : n === 2
          ? SimulatorHandPose.VICTORY
          : SimulatorHandPose.RELAXED;
    this.gesture(pose);
  }

  /**
   * Points a hand at a world-space position (e.g. a detected object). The hand
   * switches to the pointing pose and turns to aim its index finger at the
   * target.
   * @param targetWorld - The world-space point to point at.
   * @param hand - Which hand to point with. 'both' uses the hand on the same
   *     side as the target. Defaults to 'both'.
   */
  pointAt(targetWorld: THREE.Vector3, hand: AgentHandSelector = 'both') {
    let selected = hand;
    if (selected === 'both') {
      // Decide the side in the hands' own local frame, so the choice is
      // correct even when the pair is rotated or anchored to the head.
      this.worldToLocal(scratchHandsOrigin.copy(targetWorld));
      selected = scratchHandsOrigin.x >= 0 ? 'right' : 'left';
    }
    if (selected === 'left') {
      this.left.aimAt(targetWorld);
      this.right.clearAim();
      this.right.setPose(SimulatorHandPose.RELAXED);
    } else {
      this.right.aimAt(targetWorld);
      this.left.clearAim();
      this.left.setPose(SimulatorHandPose.RELAXED);
    }
  }

  // Recomputes each hand's transient motion offset/rotation for this frame.
  private updateMotions_(dt: number) {
    this.left.motionOffset.set(0, 0, 0);
    this.right.motionOffset.set(0, 0, 0);
    this.left.motionQuaternion.identity();
    this.right.motionQuaternion.identity();
    this.getWorldQuaternion(scratchQuatInv).invert();

    if (this.beatMotion) {
      const p = (this.beatMotion.t += dt) / this.beatMotion.dur;
      if (p >= 1) this.beatMotion = null;
      else {
        const amp = Math.sin(Math.PI * p) * 0.05;
        scratchOffset.set(0, -amp, 0).applyQuaternion(scratchQuatInv);
        if (this.beatMotion.sel !== 'right') {
          this.left.motionOffset.add(scratchOffset);
        }
        if (this.beatMotion.sel !== 'left') {
          this.right.motionOffset.add(scratchOffset);
        }
      }
    }

    if (this.waveMotion) {
      const p = (this.waveMotion.t += dt) / this.waveMotion.dur;
      if (p >= 1) this.waveMotion = null;
      else {
        const env = Math.sin(Math.PI * p);
        scratchOffset.set(0, env * 0.08, 0).applyQuaternion(scratchQuatInv);
        scratchAxis.set(0, 1, 0).applyQuaternion(scratchQuatInv).normalize();
        const angle = Math.sin(p * Math.PI * 6) * 0.5 * env;
        const hand = this.waveMotion.sel === 'left' ? this.left : this.right;
        hand.motionOffset.add(scratchOffset);
        hand.motionQuaternion.setFromAxisAngle(scratchAxis, angle);
      }
    }

    if (this.sizeMotion) {
      const p = (this.sizeMotion.t += dt) / this.sizeMotion.dur;
      if (p >= 1) this.sizeMotion = null;
      else {
        const half = this.sizeMotion.width * 0.5 * Math.sin(Math.PI * p);
        // Spread along the line between the hands so it works at any rig
        // orientation, then express the offset in the pair's local frame.
        this.left.root.getWorldPosition(scratchLeftPos);
        this.right.root.getWorldPosition(scratchRightPos);
        scratchSpread.copy(scratchRightPos).sub(scratchLeftPos);
        if (scratchSpread.lengthSq() > 1e-6) {
          scratchSpread.normalize().applyQuaternion(scratchQuatInv);
          this.right.motionOffset.addScaledVector(scratchSpread, half);
          this.left.motionOffset.addScaledVector(scratchSpread, -half);
        }
      }
    }
  }

  override update() {
    const now =
      typeof performance !== 'undefined' ? performance.now() : Date.now();
    let dt = this.lastNowMs ? (now - this.lastNowMs) / 1000 : 0.016;
    this.lastNowMs = now;
    dt = Math.min(Math.max(dt, 0), 0.1);
    this.updateMotions_(dt);
    this.left.animate(this.lerp);
    this.right.animate(this.lerp);
  }
}
