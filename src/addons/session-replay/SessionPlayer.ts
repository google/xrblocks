import * as THREE from 'three';
import {
  Core,
  HAND_JOINT_NAMES,
  Script,
  type Input,
  type SimulatorHandPoseJoints,
} from 'xrblocks';

import {
  POSE_LENGTH,
  getSessionRecordingDuration,
  sampleSessionRecording,
  type SessionEnvironment,
  type SessionFrame,
  type SessionRecording,
} from './SessionRecording';

const SIDES = ['left', 'right'] as const;
const WRIST_INDEX = HAND_JOINT_NAMES.indexOf('wrist');
const position = new THREE.Vector3();
const rootPosition = new THREE.Vector3();
const quaternion = new THREE.Quaternion();
const inverseQuaternion = new THREE.Quaternion();
const matrix = new THREE.Matrix4();
const parentInverse = new THREE.Matrix4();
const scale = new THREE.Vector3();
const ONE = new THREE.Vector3(1, 1, 1);

function setWorldPose(
  object: THREE.Object3D,
  pose: readonly number[],
  offset = 0
) {
  position.fromArray(pose, offset);
  quaternion.fromArray(pose, offset + 3);
  if (object.parent) {
    object.parent.updateWorldMatrix(true, false);
    matrix
      .compose(position, quaternion, ONE)
      .premultiply(parentInverse.copy(object.parent.matrixWorld).invert())
      .decompose(object.position, object.quaternion, scale);
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
function toRootRelativeJoints(
  hand: readonly number[],
  root: readonly number[],
  rootOffset: number
) {
  rootPosition.fromArray(root, rootOffset);
  inverseQuaternion.fromArray(root, rootOffset + 3).invert();
  const joints: SimulatorHandPoseJoints = [];
  for (let i = 0; i < HAND_JOINT_NAMES.length; i++) {
    const offset = i * POSE_LENGTH;
    position
      .fromArray(hand, offset)
      .sub(rootPosition)
      .applyQuaternion(inverseQuaternion);
    quaternion.fromArray(hand, offset + 3).premultiply(inverseQuaternion);
    joints.push({t: position.toArray(), r: quaternion.toArray()});
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
export class SessionPlayer extends Script {
  static dependencies = {
    core: Core,
    camera: THREE.Camera,
  };

  private core?: Core;
  private camera?: THREE.Camera;
  private recording?: SessionRecording;
  private duration = 0;
  private startTime?: number;
  private elapsed = 0;
  private nextFrameIndex = 0;
  private selected = [false, false];
  private savedHandVisibility?: boolean[];
  private resolvePlayback?: () => void;
  private loadingRoomFor?: SessionRecording;

  init({core, camera}: {core: Core; camera: THREE.Camera}) {
    this.core = core;
    this.camera = camera;
  }

  get isPlaying() {
    return this.recording !== undefined;
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
  async play(
    recording: SessionRecording,
    {environment = true}: {environment?: boolean} = {}
  ): Promise<void> {
    if (!this.core || !this.camera) {
      throw new Error(
        'SessionPlayer must be added with xb.add() and initialized before play().'
      );
    }
    if (!this.core.simulatorRunning || !this.core.simulator) {
      throw new Error('SessionPlayer replays into the desktop simulator.');
    }
    if (recording.frames.length === 0) {
      throw new Error('Cannot play an empty session recording.');
    }
    this.stop();
    const {hands} = this.core.simulator;
    this.savedHandVisibility = [
      hands.leftController.visible,
      hands.rightController.visible,
    ];
    this.recording = recording;
    this.duration = getSessionRecordingDuration(recording);
    this.startTime = undefined;
    this.elapsed = 0;
    this.nextFrameIndex = 0;
    const finished = new Promise<void>((resolve) => {
      this.resolvePlayback = resolve;
    });
    const room = recording.environment;
    if (
      environment &&
      room &&
      this.core.simulator.activeEnvironment?.manifestPath !== room.manifestPath
    ) {
      // Playback starts on the first update after the room has loaded.
      this.loadingRoomFor = recording;
      try {
        await this.loadEnvironment(room);
      } catch (error) {
        if (this.recording === recording) this.stop();
        throw error;
      } finally {
        if (this.loadingRoomFor === recording) this.loadingRoomFor = undefined;
      }
    }
    return finished;
  }

  private async loadEnvironment({name, manifestPath}: SessionEnvironment) {
    const simulator = this.core!.simulator!;
    try {
      await (name === undefined
        ? simulator.setEnvironment(manifestPath)
        : simulator.setEnvironment(name, manifestPath));
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Could not load the recorded simulator room "${name ?? manifestPath}": ${reason} ` +
          'Pass {environment: false} to play() to replay in the current room.'
      );
    }
  }

  /**
   * Stops playback and releases any selection still held by the replay. The
   * head and hands stay at their last replayed pose, and the simulator
   * controllers resume from the hands.
   */
  stop() {
    if (!this.recording) return;
    this.recording = undefined;
    for (let side = 0; side < SIDES.length; side++) {
      this.setSelected(side, false);
    }
    if (this.savedHandVisibility) {
      this.setHandVisible(0, this.savedHandVisibility[0]);
      this.setHandVisible(1, this.savedHandVisibility[1]);
    }
    this.savedHandVisibility = undefined;
    const resolve = this.resolvePlayback;
    this.resolvePlayback = undefined;
    resolve?.();
  }

  override update(time = performance.now()) {
    if (!this.recording || this.loadingRoomFor === this.recording) return;
    this.startTime ??= time;
    this.elapsed = Math.min(time - this.startTime, this.duration);
    if (!this.applySelections(this.recording)) {
      this.applyFrame(sampleSessionRecording(this.recording, this.elapsed));
    }
    if (
      this.elapsed >= this.duration &&
      this.nextFrameIndex >= this.recording.frames.length
    ) {
      this.stop();
    }
  }

  override dispose() {
    this.stop();
    super.dispose();
  }

  private applyFrame(frame: SessionFrame) {
    const core = this.core!;
    const camera = this.camera!;
    const simulator = core.simulator!;
    const {hands, simulatorControllerState} = simulator;

    setWorldPose(camera, frame.head);

    for (let side = 0; side < SIDES.length; side++) {
      const controller = core.input.controllers[side];
      const handRoot =
        side === 0 ? hands.leftController : hands.rightController;
      const recordedController = frame.controllers[side];
      const recordedHand = frame.hands[side];

      if (recordedController && controller) {
        setWorldPose(controller, recordedController.pose);
      }

      // Hands are anchored at the wrist. On a headset the controller pose is
      // the target ray, which starts several centimetres from the wrist.
      const root = recordedHand ?? recordedController?.pose;
      if (root) {
        const rootOffset = recordedHand ? WRIST_INDEX * POSE_LENGTH : 0;
        setWorldPose(handRoot, root, rootOffset);
        if (recordedHand) {
          const joints = toRootRelativeJoints(recordedHand, root, rootOffset);
          if (side === 0) {
            hands.setLeftHandJoints(joints);
          } else {
            hands.setRightHandJoints(joints);
          }
        }
        // The simulator moves its controller and hand root together. Resume
        // from the hand root so the hand stays put after playback.
        camera.worldToLocal(
          simulatorControllerState.localControllerPositions[side].copy(
            handRoot.position
          )
        );
        simulatorControllerState.localControllerOrientations[side]
          .copy(camera.quaternion)
          .invert()
          .multiply(handRoot.quaternion);
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
  private applySelections(recording: SessionRecording) {
    const {frames} = recording;
    const changed = [false, false];
    let applied = false;
    while (
      this.nextFrameIndex < frames.length &&
      frames[this.nextFrameIndex].t <= this.elapsed
    ) {
      const frame = frames[this.nextFrameIndex];
      const next = SIDES.map(
        (_, side) => frame.controllers[side]?.selected ?? false
      );
      if (
        next.some(
          (selected, side) => changed[side] && selected !== this.selected[side]
        )
      ) {
        return applied;
      }
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

  private setHandVisible(side: number, visible: boolean) {
    const {hands} = this.core!.simulator!;
    (side === 0 ? hands.leftController : hands.rightController).visible =
      visible;
    const hand = this.core!.input.hands[side];
    if (hand) hand.visible = visible;
  }

  private setSelected(side: number, selected: boolean) {
    if (this.selected[side] === selected) return;
    this.selected[side] = selected;
    const controller = this.core?.input.controllers[side];
    if (!controller) return;
    this.core!.input.dispatchEvent({
      type: selected ? 'selectstart' : 'selectend',
      target: controller,
      data: {handedness: SIDES[side]},
    } as Parameters<Input['dispatchEvent']>[0]);
  }
}
