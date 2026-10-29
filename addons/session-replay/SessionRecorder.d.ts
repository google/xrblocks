import { SessionRecording } from "./SessionRecording.js";
import * as THREE from "three";
import { Core, Script } from "xrblocks";
//#region src/addons/session-replay/SessionRecorder.d.ts
export type SessionRecorderOptions = {
  /**
   * Minimum time between recorded frames, in milliseconds. Frames where a
   * selection starts or ends are always recorded. Defaults to ~30 Hz, which
   * replays smoothly because playback interpolates between frames.
   */
  sampleIntervalMs?: number;
};
/**
 * Records the user's head, controller, selection, and hand-joint state every
 * frame so it can be replayed in the desktop simulator with
 * `SessionPlayer`. Works both in a WebXR session and in the simulator.
 */
export declare class SessionRecorder extends Script {
  static dependencies: {
    core: typeof Core;
    camera: typeof THREE.Camera;
  };
  readonly sampleIntervalMs: number;
  private core?;
  private camera?;
  private recording?;
  private startTime?;
  private lastSampleTime;
  private lastUpdateTime?;
  private lastSelected;
  private sessionEnded;
  constructor({ sampleIntervalMs }?: SessionRecorderOptions);
  init({ core, camera }: {
    core: Core;
    camera: THREE.Camera;
  }): void;
  get isRecording(): boolean;
  /**
   * Starts a new recording. The first frame is captured on the next update.
   * @param options.state - Optional JSON-serializable app state to store with
   * the recording, copied now so later changes don't affect it.
   */
  start({ state }?: {
    state?: unknown;
  }): void;
  private resetTimeline;
  /**
   * Entering XR while recording on the page restarts the recording as a
   * headset one, keeping its state. The page frames are in a different space.
   */
  onXRSessionStarted(): void;
  /**
   * Leaving XR ends a headset recording's frames. `stop()` still returns
   * everything captured during the session.
   */
  onXRSessionEnded(): void;
  /**
   * Stops recording.
   * @returns The finished recording.
   */
  stop(): SessionRecording;
  update(time?: number): void;
  private captureController;
  private captureHand;
}
//#endregion