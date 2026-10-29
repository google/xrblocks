import { SessionRecording } from "./SessionRecording.js";
import * as THREE from "three";
import { Core, Script } from "xrblocks";
//#region src/addons/session-replay/SessionPlayer.d.ts
/**
 * Replays a recording made with `SessionRecorder` in the desktop simulator.
 * Head, controller, and hand-joint poses are driven from the recording, and
 * `selectstart` / `selectend` fire where they were recorded, so scripts
 * respond as if the user performed the session again.
 *
 * Poses are applied during script updates. Add the player before other
 * scripts so they observe the replayed pose in the same frame.
 */
export declare class SessionPlayer extends Script {
  static dependencies: {
    core: typeof Core;
    camera: typeof THREE.Camera;
  };
  private core?;
  private camera?;
  private recording?;
  private duration;
  private startTime?;
  private elapsed;
  private nextFrameIndex;
  private selected;
  private savedHandVisibility?;
  private savedConnected?;
  private resolvePlayback?;
  private loadingRoomFor?;
  init({ core, camera }: {
    core: Core;
    camera: THREE.Camera;
  }): void;
  get isPlaying(): boolean;
  /** Milliseconds played in the current recording. */
  get currentTimeMs(): number;
  /**
   * Starts replaying a recording, stopping any current playback. A simulator
   * recording first switches to the room it was made in.
   * @param options.environment - Set to `false` to replay in the current
   * simulator room instead of the recorded one.
   * @returns A promise that resolves when playback finishes or is stopped,
   * and rejects if the recorded room cannot be loaded.
   */
  play(recording: SessionRecording, { environment }?: {
    environment?: boolean;
  }): Promise<void>;
  private loadEnvironment;
  /**
   * Stops playback and ends any selection still held by the replay. The head
   * and hands stay at their last replayed pose, and the simulator controllers
   * resume from the hands.
   */
  stop(): void;
  update(time?: number): void;
  dispose(): void;
  private applyFrame;
  /**
   * Fires every selection change recorded since the last update, so a pinch
   * shorter than one playback frame is not skipped. Interaction samples the
   * selected state once per frame, so a second change on the same side waits
   * for the next update. Each change is fired from its frame's exact pose,
   * since a pose blended with the next frame can aim the ray elsewhere.
   * @returns Whether any selection changed, leaving that frame's pose applied.
   */
  private applySelections;
  private setHandVisible;
  private setSelected;
}
//#endregion