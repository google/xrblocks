import * as THREE from 'three';
import {HAND_JOINT_NAMES} from 'xrblocks';

export const SESSION_RECORDING_FORMAT = 'xrblocks-session';
export const SESSION_RECORDING_VERSION = 1;

/** World-space position (x, y, z) followed by quaternion (x, y, z, w). */
export type SessionPose = number[];

/** Values indexed by hand: `[left, right]`. */
export type SessionSides<T> = [T, T];

export type SessionControllerFrame = {
  pose: SessionPose;
  selected: boolean;
};

export type SessionFrame = {
  /** Milliseconds since the recording started. */
  t: number;
  head: SessionPose;
  controllers: SessionSides<SessionControllerFrame | null>;
  /**
   * World poses of every joint in `jointNames` order, flattened to seven
   * numbers per joint. `null` when the hand was not fully tracked.
   */
  hands: SessionSides<number[] | null>;
};

export type SessionEnvironment = {
  name?: string;
  manifestPath: string;
};

export type SessionRecording = {
  format: typeof SESSION_RECORDING_FORMAT;
  version: typeof SESSION_RECORDING_VERSION;
  /** Where the recording was captured. */
  source: 'xr' | 'simulator' | 'desktop';
  jointNames: string[];
  frames: SessionFrame[];
  /**
   * Simulator room the recording was made in. `SessionPlayer.play()` switches
   * to it first. Absent for headset recordings, whose room was the real one.
   */
  environment?: SessionEnvironment;
  /**
   * App state passed to `SessionRecorder.start()`. Replay only drives input,
   * so restore this before `SessionPlayer.play()` to start the scene where the
   * recording did.
   */
  state?: unknown;
};

export const POSE_LENGTH = 7;
export const HAND_LENGTH = HAND_JOINT_NAMES.length * POSE_LENGTH;

function fail(message: string): never {
  throw new Error(`Invalid session recording: ${message}`);
}

function isNumberArray(value: unknown, length: number): value is number[] {
  return (
    Array.isArray(value) &&
    value.length === length &&
    value.every((item) => typeof item === 'number' && Number.isFinite(item))
  );
}

function validateSides(
  value: unknown,
  where: string,
  validate: (item: unknown, where: string) => void
) {
  if (!Array.isArray(value) || value.length !== 2) {
    fail(`${where} must be a [left, right] array.`);
  }
  value.forEach((item, side) => {
    if (item !== null) validate(item, `${where}[${side}]`);
  });
}

function validateController(value: unknown, where: string) {
  if (typeof value !== 'object' || value === null) {
    fail(`${where} must be an object or null.`);
  }
  const controller = value as Partial<SessionControllerFrame>;
  if (!isNumberArray(controller.pose, POSE_LENGTH)) {
    fail(`${where}.pose must be ${POSE_LENGTH} finite numbers.`);
  }
  if (typeof controller.selected !== 'boolean') {
    fail(`${where}.selected must be a boolean.`);
  }
}

function validateHand(value: unknown, where: string) {
  if (!isNumberArray(value, HAND_LENGTH)) {
    fail(`${where} must be ${HAND_LENGTH} finite numbers or null.`);
  }
}

/**
 * Parses and validates a session recording, such as the contents of a file
 * saved with {@link downloadSessionRecording}.
 * @param input - JSON text or an already parsed object.
 * @returns The validated recording.
 */
export function parseSessionRecording(input: unknown): SessionRecording {
  const value = typeof input === 'string' ? JSON.parse(input) : input;
  if (typeof value !== 'object' || value === null) {
    fail('expected an object.');
  }
  const recording = value as Partial<SessionRecording>;
  if (recording.format !== SESSION_RECORDING_FORMAT) {
    fail(`format must be "${SESSION_RECORDING_FORMAT}".`);
  }
  if (recording.version !== SESSION_RECORDING_VERSION) {
    fail(`unsupported version ${String(recording.version)}.`);
  }
  if (!['xr', 'simulator', 'desktop'].includes(recording.source as string)) {
    fail('source must be "xr", "simulator", or "desktop".');
  }
  if (
    !Array.isArray(recording.jointNames) ||
    recording.jointNames.length !== HAND_JOINT_NAMES.length ||
    recording.jointNames.some((name, i) => name !== HAND_JOINT_NAMES[i])
  ) {
    fail('jointNames must match HAND_JOINT_NAMES.');
  }
  if (recording.environment !== undefined) {
    const environment = recording.environment as Partial<SessionEnvironment>;
    if (
      typeof environment !== 'object' ||
      environment === null ||
      typeof environment.manifestPath !== 'string' ||
      (environment.name !== undefined && typeof environment.name !== 'string')
    ) {
      fail('environment must have a string manifestPath and optional name.');
    }
  }
  if (!Array.isArray(recording.frames)) {
    fail('frames must be an array.');
  }
  let previousTime = 0;
  recording.frames.forEach((frame, i) => {
    const where = `frames[${i}]`;
    if (typeof frame !== 'object' || frame === null) {
      fail(`${where} must be an object.`);
    }
    if (!Number.isFinite(frame.t) || frame.t < previousTime) {
      fail(`${where}.t must be a finite, non-decreasing number.`);
    }
    previousTime = frame.t;
    if (!isNumberArray(frame.head, POSE_LENGTH)) {
      fail(`${where}.head must be ${POSE_LENGTH} finite numbers.`);
    }
    validateSides(
      frame.controllers,
      `${where}.controllers`,
      validateController
    );
    validateSides(frame.hands, `${where}.hands`, validateHand);
  });
  return recording as SessionRecording;
}

/** Duration of a recording in milliseconds. */
export function getSessionRecordingDuration(recording: SessionRecording) {
  return recording.frames.at(-1)?.t ?? 0;
}

function lerpPoses(
  a: readonly number[],
  b: readonly number[],
  alpha: number
): number[] {
  const out = new Array<number>(a.length);
  for (let offset = 0; offset < a.length; offset += POSE_LENGTH) {
    for (let i = 0; i < 3; i++) {
      out[offset + i] = a[offset + i] + (b[offset + i] - a[offset + i]) * alpha;
    }
    THREE.Quaternion.slerpFlat(
      out,
      offset + 3,
      a as number[],
      offset + 3,
      b as number[],
      offset + 3,
      alpha
    );
  }
  return out;
}

function findFrameIndex(frames: SessionFrame[], timeMs: number) {
  let low = 0;
  let high = frames.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    if (frames[mid].t <= timeMs) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  return low;
}

/**
 * Returns the recorded state at `timeMs`, interpolating poses between the
 * surrounding frames. Selection and tracking changes take effect at the frame
 * where they were recorded.
 */
export function sampleSessionRecording(
  recording: SessionRecording,
  timeMs: number
): SessionFrame {
  const {frames} = recording;
  if (frames.length === 0) {
    throw new Error('Cannot sample an empty session recording.');
  }
  const index = findFrameIndex(frames, timeMs);
  const a = frames[index];
  const b = frames[Math.min(index + 1, frames.length - 1)];
  const span = b.t - a.t;
  const alpha =
    span > 0 ? THREE.MathUtils.clamp((timeMs - a.t) / span, 0, 1) : 0;

  const sampleController = (side: 0 | 1) => {
    const from = a.controllers[side];
    if (!from) return null;
    const to = b.controllers[side];
    return {
      pose: to ? lerpPoses(from.pose, to.pose, alpha) : from.pose.slice(),
      selected: from.selected,
    };
  };
  const sampleHand = (side: 0 | 1) => {
    const from = a.hands[side];
    if (!from) return null;
    const to = b.hands[side];
    return to ? lerpPoses(from, to, alpha) : from.slice();
  };

  return {
    t: timeMs,
    head: lerpPoses(a.head, b.head, alpha),
    controllers: [sampleController(0), sampleController(1)],
    hands: [sampleHand(0), sampleHand(1)],
  };
}

/**
 * Saves a recording as a JSON file through the browser's download flow.
 * @param recording - The recording to save.
 * @param filename - Name of the downloaded file.
 */
export function downloadSessionRecording(
  recording: SessionRecording,
  filename = 'xrblocks-session.json'
) {
  const blob = new Blob([JSON.stringify(recording)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}
