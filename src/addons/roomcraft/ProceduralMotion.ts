import * as THREE from 'three';

import {
  MAX_MOTION_AMPLITUDE,
  MAX_MOTION_PERIOD,
  MAX_MOTION_SPEED,
  MAX_PART_DISTANCE,
  MIN_MOTION_PERIOD,
  SCENE_MOTION_AXES,
  type SceneMotionAxis,
  type ScenePart,
} from './SceneTypes';

const FULL_TURN = Math.PI * 2;

/** Component index of each part-local motion axis. */
export const MOTION_AXIS_INDEX: Record<SceneMotionAxis, number> = {
  x: 0,
  y: 1,
  z: 2,
};

interface MotionBase {
  /** Axis in the part's own rotated frame. */
  axis: SceneMotionAxis;
  /** Hinge or axle in part-local meters, relative to the authored center. */
  pivot: THREE.Vector3;
  /** Declared starting fraction of a cycle; an absent phase reads as 0. */
  phase: number;
}

export interface SwingMotion extends MotionBase {
  kind: 'swing';
  amplitude: number;
  period: number;
}

export interface SpinMotion extends MotionBase {
  kind: 'spin';
  speed: number;
}

/** A validated, detached copy of one part's motion definition. */
export type PartMotion = SwingMotion | SpinMotion;

interface MotionTrack {
  id: string;
  motion: PartMotion;
  group: THREE.Object3D;
  basePosition: THREE.Vector3;
  baseQuaternion: THREE.Quaternion;
  /** Live cycle fraction, always wrapped into [0, 1). */
  cycle: number;
}

function fail(id: string, reason: string): never {
  throw new Error(`Procedural part "${id}" has ${reason}.`);
}

function bounded(value: unknown, low: number, high: number) {
  return typeof value === 'number' && value >= low && value <= high;
}

/**
 * Validates one part's optional motion and copies it away from the caller's
 * data, so a live design never shares mutable definitions or produces NaN
 * transforms from malformed numbers.
 *
 * @param part - The authored part, whose rest pose is left untouched.
 * @returns The detached motion, or undefined when the part is static.
 */
export function readPartMotion(part: ScenePart): PartMotion | undefined {
  const motion = part.motion;
  if (motion === undefined || motion === null) return undefined;
  if (!SCENE_MOTION_AXES.includes(motion.axis)) {
    fail(part.id, `an unknown motion axis "${motion.axis}"`);
  }
  const pivot = motion.pivot;
  if (
    !Array.isArray(pivot) ||
    pivot.length !== 3 ||
    pivot.some(
      (value) => !bounded(value, -MAX_PART_DISTANCE, MAX_PART_DISTANCE)
    )
  ) {
    fail(part.id, `a motion pivot outside +/-${MAX_PART_DISTANCE} meters`);
  }
  const phase = motion.phase === undefined ? 0 : motion.phase;
  if (!bounded(phase, 0, 1)) {
    fail(part.id, 'a starting motion phase outside 0 to 1');
  }
  const base = {
    axis: motion.axis,
    pivot: new THREE.Vector3().fromArray(pivot),
    phase,
  };
  if (motion.kind === 'swing') {
    if (!bounded(motion.amplitude, Number.MIN_VALUE, MAX_MOTION_AMPLITUDE)) {
      fail(part.id, `a swing amplitude outside 0 to ${MAX_MOTION_AMPLITUDE}`);
    }
    if (!bounded(motion.period, MIN_MOTION_PERIOD, MAX_MOTION_PERIOD)) {
      fail(
        part.id,
        `a swing period outside ${MIN_MOTION_PERIOD} to ${MAX_MOTION_PERIOD} seconds`
      );
    }
    return {
      ...base,
      kind: 'swing',
      amplitude: motion.amplitude,
      period: motion.period,
    };
  }
  if (motion.kind === 'spin') {
    if (
      !bounded(motion.speed, -MAX_MOTION_SPEED, MAX_MOTION_SPEED) ||
      motion.speed === 0
    ) {
      fail(
        part.id,
        `a spin speed outside +/-${MAX_MOTION_SPEED} radians per second, or none`
      );
    }
    return {...base, kind: 'spin', speed: motion.speed};
  }
  fail(part.id, `an unknown motion kind "${(motion as PartMotion).kind}"`);
}

/** The angle a motion reaches at one cycle fraction, in radians. */
export function motionAngle(motion: PartMotion, cycle: number) {
  return motion.kind === 'swing'
    ? motion.amplitude * Math.sin(FULL_TURN * cycle)
    : FULL_TURN * cycle;
}

/** The closed angular interval a motion can reach over its whole cycle. */
export function motionAngleRange(motion: PartMotion): [number, number] {
  return motion.kind === 'swing'
    ? [-motion.amplitude, motion.amplitude]
    : [0, FULL_TURN];
}

/** Cycle fractions stay bounded, so long sessions cannot lose precision. */
function wrapCycle(cycle: number) {
  const wrapped = cycle % 1;
  return wrapped < 0 ? wrapped + 1 : wrapped;
}

/** Part groups only; a mesh display name may collide with a part ID. */
function collectPartGroups(content: THREE.Object3D) {
  const groups = new Map<string, THREE.Object3D>();
  const visit = (object: THREE.Object3D) => {
    for (const child of object.children) {
      if (!(child instanceof THREE.Group)) continue;
      if (!groups.has(child.name)) groups.set(child.name, child);
      visit(child);
    }
  };
  visit(content);
  return groups;
}

/**
 * Animates the authored parts of one built procedural design in place.
 *
 * Each animated part rotates about its own local pivot, so descendants ride
 * along and the outer Roomcraft object stays a single grabbable owner. Rest
 * poses stay authored data: every frame is recomputed from them rather than
 * accumulated, and part sizes never scale descendants. The player owns no
 * timers, subscriptions, or GPU resources; the caller drives it per frame.
 */
export class ProceduralMotionPlayer {
  private readonly tracks: MotionTrack[] = [];
  private readonly axis = new THREE.Vector3();
  private readonly offset = new THREE.Quaternion();
  private readonly lever = new THREE.Vector3();

  /**
   * @param content - The built design; its part groups are posed in place.
   * @param parts - The authored parts, read and copied, never retained.
   * @param previous - The replaced player, read once for live cycle phases.
   */
  constructor(
    content: THREE.Group,
    parts: readonly ScenePart[],
    previous?: ProceduralMotionPlayer
  ) {
    const groups = collectPartGroups(content);
    const carried = new Map<string, MotionTrack>();
    for (const track of previous?.tracks ?? []) carried.set(track.id, track);
    for (const part of parts) {
      const motion = readPartMotion(part);
      if (!motion) continue;
      const group = groups.get(part.id);
      if (!group) {
        fail(part.id, 'motion but no part group in the built design');
      }
      if (
        [...part.position, ...part.rotation].some(
          (value) => !Number.isFinite(value)
        )
      ) {
        fail(part.id, 'motion on a non-finite rest pose');
      }
      const before = carried.get(part.id);
      const resumed =
        before &&
        before.motion.kind === motion.kind &&
        before.motion.phase === motion.phase;
      this.tracks.push({
        id: part.id,
        motion,
        group,
        basePosition: new THREE.Vector3().fromArray(part.position),
        baseQuaternion: new THREE.Quaternion().setFromEuler(
          new THREE.Euler(part.rotation[0], part.rotation[1], part.rotation[2])
        ),
        cycle: resumed ? before.cycle : wrapCycle(motion.phase),
      });
    }
    // Pose immediately, so replacing a design never flashes the rest pose.
    this.apply();
  }

  /** How many parts this player animates. */
  get count() {
    return this.tracks.length;
  }

  /**
   * Advances every cycle and reposes the design.
   *
   * @param deltaSeconds - Elapsed frame time; zero re-applies the current pose.
   */
  update(deltaSeconds: number) {
    if (
      typeof deltaSeconds !== 'number' ||
      !Number.isFinite(deltaSeconds) ||
      deltaSeconds < 0
    ) {
      throw new Error(
        'Procedural motion needs a finite, non-negative time step.'
      );
    }
    for (const track of this.tracks) {
      const motion = track.motion;
      // Reduce elapsed time before multiplication so finite deltas cannot overflow.
      const cycles =
        motion.kind === 'swing'
          ? (deltaSeconds % motion.period) / motion.period
          : ((deltaSeconds % (FULL_TURN / Math.abs(motion.speed))) *
              motion.speed) /
            FULL_TURN;
      track.cycle = wrapCycle(track.cycle + cycles);
    }
    this.apply();
  }

  /** Rebuilds each animated pose from its rest data, never from the last frame. */
  private apply() {
    for (const track of this.tracks) {
      const {group, motion, baseQuaternion} = track;
      this.axis.set(0, 0, 0).setComponent(MOTION_AXIS_INDEX[motion.axis], 1);
      this.offset.setFromAxisAngle(this.axis, motionAngle(motion, track.cycle));
      group.quaternion.copy(baseQuaternion).multiply(this.offset);
      group.position
        .copy(track.basePosition)
        .add(this.lever.copy(motion.pivot).applyQuaternion(baseQuaternion))
        .sub(this.lever.copy(motion.pivot).applyQuaternion(group.quaternion));
    }
  }
}
