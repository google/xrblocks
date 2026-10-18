import * as THREE from 'three';
import {Core, HAND_JOINT_NAMES, Script, type Input} from 'xrblocks';

import {
  POSE_LENGTH,
  SESSION_RECORDING_FORMAT,
  SESSION_RECORDING_VERSION,
  type SessionControllerFrame,
  type SessionFrame,
  type SessionPose,
  type SessionRecording,
} from './SessionRecording';

export type SessionRecorderOptions = {
  /**
   * Minimum time between recorded frames, in milliseconds. Frames where a
   * selection starts or ends are always recorded. Defaults to ~30 Hz, which
   * replays smoothly because playback interpolates between frames.
   */
  sampleIntervalMs?: number;
};

const SIDES = ['left', 'right'] as const;
/** Longer gaps between updates are cut from the recording's timeline. */
const MAX_PAUSE_MS = 500;
const position = new THREE.Vector3();
const quaternion = new THREE.Quaternion();
const scale = new THREE.Vector3();

function round(value: number) {
  return Math.round(value * 1e5) / 1e5;
}

function writePose(out: number[], offset: number, matrix: THREE.Matrix4) {
  matrix.decompose(position, quaternion, scale);
  out[offset] = round(position.x);
  out[offset + 1] = round(position.y);
  out[offset + 2] = round(position.z);
  out[offset + 3] = round(quaternion.x);
  out[offset + 4] = round(quaternion.y);
  out[offset + 5] = round(quaternion.z);
  out[offset + 6] = round(quaternion.w);
}

function readWorldPose(object: THREE.Object3D): SessionPose {
  object.updateWorldMatrix(true, false);
  const pose: SessionPose = [];
  writePose(pose, 0, object.matrixWorld);
  return pose;
}

type HandednessSource = {inputSource?: {handedness?: string}};

/**
 * Finds the WebXR input source index for a hand. Real XR orders input sources
 * by connection, not handedness, so prefer the reported handedness.
 */
function findSourceIndex(input: Input, side: (typeof SIDES)[number]) {
  let anyReported = false;
  for (let i = 0; i < SIDES.length && i < input.controllers.length; i++) {
    const handedness = (input.controllers[i] as HandednessSource).inputSource
      ?.handedness;
    if (handedness === side) return i;
    anyReported ||= handedness !== undefined;
  }
  return anyReported ? -1 : SIDES.indexOf(side);
}

/**
 * Records the user's head, controller, selection, and hand-joint state every
 * frame so it can be replayed in the desktop simulator with
 * `SessionPlayer`. Works both in a WebXR session and in the simulator.
 */
export class SessionRecorder extends Script {
  static dependencies = {
    core: Core,
    camera: THREE.Camera,
  };

  readonly sampleIntervalMs: number;
  private core?: Core;
  private camera?: THREE.Camera;
  private recording?: SessionRecording;
  private startTime?: number;
  private lastSampleTime = -Infinity;
  private lastUpdateTime?: number;
  private lastSelected = [false, false];
  private sessionEnded = false;

  constructor({sampleIntervalMs = 1000 / 30}: SessionRecorderOptions = {}) {
    super();
    if (!Number.isFinite(sampleIntervalMs) || sampleIntervalMs < 0) {
      throw new RangeError('sampleIntervalMs must be a finite number >= 0.');
    }
    this.sampleIntervalMs = sampleIntervalMs;
  }

  init({core, camera}: {core: Core; camera: THREE.Camera}) {
    this.core = core;
    this.camera = camera;
  }

  get isRecording() {
    return this.recording !== undefined;
  }

  /**
   * Starts a new recording. The first frame is captured on the next update.
   * @param options.state - Optional JSON-serializable app state to store with
   * the recording, copied now so later changes don't affect it.
   */
  start({state}: {state?: unknown} = {}) {
    if (!this.core || !this.camera) {
      throw new Error(
        'SessionRecorder must be added with xb.add() and initialized before start().'
      );
    }
    this.recording = {
      format: SESSION_RECORDING_FORMAT,
      version: SESSION_RECORDING_VERSION,
      source: this.core.renderer?.xr.isPresenting
        ? 'xr'
        : this.core.simulatorRunning
          ? 'simulator'
          : 'desktop',
      jointNames: [...HAND_JOINT_NAMES],
      frames: [],
    };
    const environment = this.core.simulatorRunning
      ? this.core.simulator?.activeEnvironment
      : undefined;
    if (environment && this.recording.source === 'simulator') {
      const {name, manifestPath} = environment;
      this.recording.environment =
        name === undefined ? {manifestPath} : {name, manifestPath};
    }
    if (state !== undefined) {
      this.recording.state = JSON.parse(JSON.stringify(state));
    }
    this.resetTimeline();
  }

  private resetTimeline() {
    this.startTime = undefined;
    this.lastSampleTime = -Infinity;
    this.lastUpdateTime = undefined;
    this.lastSelected = [false, false];
    this.sessionEnded = false;
  }

  /**
   * Entering XR while recording on the page restarts the recording as a
   * headset one, keeping its state. The page frames are in a different space.
   */
  override onXRSessionStarted() {
    if (!this.recording || this.recording.source === 'xr') return;
    this.recording.source = 'xr';
    this.recording.frames = [];
    delete this.recording.environment;
    this.resetTimeline();
  }

  /**
   * Leaving XR ends a headset recording's frames. `stop()` still returns
   * everything captured during the session.
   */
  override onXRSessionEnded() {
    if (this.recording?.source === 'xr') this.sessionEnded = true;
  }

  /**
   * Stops recording.
   * @returns The finished recording.
   */
  stop(): SessionRecording {
    if (!this.recording) {
      throw new Error('SessionRecorder is not recording.');
    }
    const recording = this.recording;
    this.recording = undefined;
    return recording;
  }

  override update(time = performance.now()) {
    if (!this.recording || !this.core || !this.camera || this.sessionEnded) {
      return;
    }
    this.startTime ??= time;
    // Frames stop while the headset is off or the tab is hidden. Cut the pause
    // so replay jumps across it instead of gliding the hands for its length.
    const paused =
      this.lastUpdateTime !== undefined &&
      time - this.lastUpdateTime > MAX_PAUSE_MS;
    if (paused) this.startTime = time - this.lastSampleTime;
    this.lastUpdateTime = time;
    const t = time - this.startTime;

    const input = this.core.input;
    const indices = SIDES.map((side) => findSourceIndex(input, side));
    const selected = indices.map(
      (index) => input.controllers[index]?.userData.selected === true
    );
    const selectionChanged = selected.some(
      (value, side) => value !== this.lastSelected[side]
    );
    if (
      t - this.lastSampleTime < this.sampleIntervalMs &&
      !selectionChanged &&
      !paused
    ) {
      return;
    }
    this.lastSampleTime = t;
    this.lastSelected = selected;

    const frame: SessionFrame = {
      t: Math.round(t),
      head: readWorldPose(this.camera),
      controllers: [
        this.captureController(indices[0]),
        this.captureController(indices[1]),
      ],
      hands: [this.captureHand(indices[0]), this.captureHand(indices[1])],
    };
    this.recording.frames.push(frame);
  }

  private captureController(index: number): SessionControllerFrame | null {
    const controller = this.core!.input.controllers[index];
    if (!controller?.userData.connected) return null;
    return {
      pose: readWorldPose(controller),
      selected: controller.userData.selected === true,
    };
  }

  private captureHand(index: number): number[] | null {
    const hand = this.core!.input.hands[index];
    if (!hand?.visible) return null;
    hand.updateWorldMatrix(true, true);
    const joints: number[] = [];
    for (let i = 0; i < HAND_JOINT_NAMES.length; i++) {
      const joint = hand.joints[HAND_JOINT_NAMES[i]];
      if (!joint?.visible) return null;
      writePose(joints, i * POSE_LENGTH, joint.matrixWorld);
    }
    return joints;
  }
}
