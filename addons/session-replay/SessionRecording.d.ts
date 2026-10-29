//#region src/addons/session-replay/SessionRecording.d.ts
export declare const SESSION_RECORDING_FORMAT = "xrblocks-session";
export declare const SESSION_RECORDING_VERSION = 1;
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
export declare const POSE_LENGTH = 7;
export declare const HAND_LENGTH: number;
/**
 * Parses and validates a session recording, such as the contents of a file
 * saved with {@link downloadSessionRecording}.
 * @param input - JSON text or an already parsed object.
 * @returns The validated recording.
 */
export declare function parseSessionRecording(input: unknown): SessionRecording;
/** Duration of a recording in milliseconds. */
export declare function getSessionRecordingDuration(recording: SessionRecording): number;
/**
 * Returns the recorded state at `timeMs`, interpolating poses between the
 * surrounding frames. Selection and tracking changes take effect at the frame
 * where they were recorded.
 */
export declare function sampleSessionRecording(recording: SessionRecording, timeMs: number): SessionFrame;
/**
 * Saves a recording as a JSON file through the browser's download flow.
 * @param recording - The recording to save.
 * @param filename - Name of the downloaded file.
 */
export declare function downloadSessionRecording(recording: SessionRecording, filename?: string): void;
//#endregion