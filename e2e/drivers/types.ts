/**
 * Driver abstraction for XR Blocks end-to-end scenarios. Phase 0 ships the
 * desktop-simulator driver; a later phase adds an IWER-backed WebXR driver so
 * the same scenarios run against both the simulator and an emulated
 * immersive session.
 */

export type Vec3 = [number, number, number];

export type Hand = 'leftHand' | 'rightHand';

export type HandControl = {
  move?: Vec3;
  rotate?: Vec3;
  selectStart?: boolean;
  selectEnd?: boolean;
  visible?: boolean;
};

export type CompoundControl = {
  locomotion?: {move?: Vec3; rotate?: Vec3};
  leftHand?: HandControl;
  rightHand?: HandControl;
};

export type DriverState = {
  /** Lifecycle state reported by Core. */
  lifecycle: string | null;
  /** Number of probe-script update ticks observed. */
  frames: number;
  /** Probe rotation around Y (radians), proving the frame loop advances. */
  probeRotationY: number;
  /** Scene object names present under the probe root. */
  sceneObjects: string[];
  /** Framebuffer width/height of the renderer canvas. */
  canvasSize: {width: number; height: number};
  /** Whether the grabbable script is currently hovered by a hand ray. */
  hovered: boolean;
  /** Controller id holding the grabbable script, or null. */
  grabbedByHand: number | null;
  /** Whether the UI card subtree is mounted in the scene. */
  uiCardPresent: boolean;
  /** Whether the depth subsystem is enabled. */
  depthEnabled: boolean;
  /** Whether the depth mesh was created from depth-sensing data. */
  depthMeshPresent: boolean;
  /** Plane meshes the SDK created from detected XR planes. */
  worldPlanes: number;
  /** Meshes the SDK created from detected XR scene meshes. */
  worldMeshes: number;
  /** Planes tracked by the emulated environment (emulator-side truth). */
  semPlanes: number;
  /** Meshes tracked by the emulated environment (emulator-side truth). */
  semMeshes: number;
};

export type FrameStats = {
  /** Fraction of sampled pixels that are not clear-color. */
  nonBlackFraction: number;
  /** Mean luma of sampled pixels (0-255). */
  meanLuma: number;
  samples: number;
};

export interface XRTestDriver {
  /** Boot the given harness app (path relative to the repo root). */
  boot(appPath: string): Promise<void>;
  /** Sample driver/engine state. */
  getState(): Promise<DriverState>;
  /** Advance simulated time with an optional compound control. */
  step(durationMs: number, control?: CompoundControl): Promise<void>;
  /** Point a hand's ray at a named scene object. */
  pointTo(hand: Hand, objectName: string): Promise<void>;
  /** Run a primary select (pinch) gesture with one hand. */
  select(hand: Hand, press: boolean): Promise<void>;
  /** Capture the rendered frame and return pixel statistics. */
  captureFrame(): Promise<FrameStats>;
  /** Tear the session down. */
  destroy(): Promise<void>;
}
