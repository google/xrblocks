import * as THREE from 'three';
import { SceneValidationError } from './SceneValidationError.js';
import { SCENE_MOTION_AXES, MAX_PART_DISTANCE, MAX_MOTION_AMPLITUDE, MAX_MOTION_PERIOD, MIN_MOTION_PERIOD, MAX_MOTION_SPEED } from './SceneTypes.js';

const FULL_TURN = Math.PI * 2;
/** Component index of each part-local motion axis. */
const MOTION_AXIS_INDEX = {
    x: 0,
    y: 1,
    z: 2,
};
function fail(id, reason) {
    throw new SceneValidationError(`Procedural part "${id}" has ${reason}.`);
}
function bounded(value, low, high) {
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
function readPartMotion(part) {
    const motion = part.motion;
    if (motion === undefined || motion === null)
        return undefined;
    if (!SCENE_MOTION_AXES.includes(motion.axis)) {
        fail(part.id, `an unknown motion axis "${motion.axis}"`);
    }
    const pivot = motion.pivot;
    if (!Array.isArray(pivot) ||
        pivot.length !== 3 ||
        pivot.some((value) => !bounded(value, -MAX_PART_DISTANCE, MAX_PART_DISTANCE))) {
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
            fail(part.id, `a swing period outside ${MIN_MOTION_PERIOD} to ${MAX_MOTION_PERIOD} seconds`);
        }
        return {
            ...base,
            kind: 'swing',
            amplitude: motion.amplitude,
            period: motion.period,
        };
    }
    if (motion.kind === 'spin') {
        if (!bounded(motion.speed, -MAX_MOTION_SPEED, MAX_MOTION_SPEED) ||
            motion.speed === 0) {
            fail(part.id, `a spin speed outside +/-${MAX_MOTION_SPEED} radians per second, or none`);
        }
        return { ...base, kind: 'spin', speed: motion.speed };
    }
    fail(part.id, `an unknown motion kind "${motion.kind}"`);
}
/** The angle a motion reaches at one cycle fraction, in radians. */
function motionAngle(motion, cycle) {
    return motion.kind === 'swing'
        ? motion.amplitude * Math.sin(FULL_TURN * cycle)
        : FULL_TURN * cycle;
}
/** The closed angular interval a motion can reach over its whole cycle. */
function motionAngleRange(motion) {
    return motion.kind === 'swing'
        ? [-motion.amplitude, motion.amplitude]
        : [0, FULL_TURN];
}
/** Cycle fractions stay bounded, so long sessions cannot lose precision. */
function wrapCycle(cycle) {
    // Avoid euclideanModulo's addition rounding away tiny in-range advances.
    if (cycle >= 0 && cycle < 1)
        return cycle;
    return THREE.MathUtils.euclideanModulo(cycle, 1);
}
/** Part groups only; a mesh display name may collide with a part ID. */
function collectPartGroups(content) {
    const groups = new Map();
    const visit = (object) => {
        for (const child of object.children) {
            if (!(child instanceof THREE.Group))
                continue;
            if (!groups.has(child.name))
                groups.set(child.name, child);
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
class ProceduralMotionPlayer {
    /**
     * @param content - The built design; its part groups are posed in place.
     * @param parts - The authored parts, read and copied, never retained.
     * @param previous - The replaced player, read once for live cycle phases.
     */
    constructor(content, parts, previous) {
        this.tracks = [];
        this.axis = new THREE.Vector3();
        this.offset = new THREE.Quaternion();
        this.lever = new THREE.Vector3();
        const groups = collectPartGroups(content);
        const carried = new Map();
        for (const track of previous?.tracks ?? [])
            carried.set(track.id, track);
        for (const part of parts) {
            const motion = readPartMotion(part);
            if (!motion)
                continue;
            const group = groups.get(part.id);
            if (!group) {
                fail(part.id, 'motion but no part group in the built design');
            }
            if ([...part.position, ...part.rotation].some((value) => !Number.isFinite(value))) {
                fail(part.id, 'motion on a non-finite rest pose');
            }
            const before = carried.get(part.id);
            const resumed = before &&
                before.motion.kind === motion.kind &&
                before.motion.phase === motion.phase;
            this.tracks.push({
                id: part.id,
                motion,
                group,
                basePosition: new THREE.Vector3().fromArray(part.position),
                baseQuaternion: new THREE.Quaternion().setFromEuler(new THREE.Euler(part.rotation[0], part.rotation[1], part.rotation[2])),
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
    update(deltaSeconds) {
        if (typeof deltaSeconds !== 'number' ||
            !Number.isFinite(deltaSeconds) ||
            deltaSeconds < 0) {
            throw new Error('Procedural motion needs a finite, non-negative time step.');
        }
        for (const track of this.tracks) {
            const motion = track.motion;
            // Reduce elapsed time before multiplication so finite deltas cannot overflow.
            const cycles = motion.kind === 'swing'
                ? (deltaSeconds % motion.period) / motion.period
                : ((deltaSeconds % (FULL_TURN / Math.abs(motion.speed))) *
                    motion.speed) /
                    FULL_TURN;
            track.cycle = wrapCycle(track.cycle + cycles);
        }
        this.apply();
    }
    /** Rebuilds each animated pose from its rest data, never from the last frame. */
    apply() {
        for (const track of this.tracks) {
            const { group, motion, baseQuaternion } = track;
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

export { MOTION_AXIS_INDEX, ProceduralMotionPlayer, motionAngle, motionAngleRange, readPartMotion };
