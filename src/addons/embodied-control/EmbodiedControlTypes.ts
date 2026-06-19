import type {SimulatorHandPoseRotations} from 'xrblocks';

export type Vec3Tuple = [number, number, number];
export type QuatTuple = [number, number, number, number];

export type LocomotionControl = {
  /** Meters over the whole step, camera-relative: [strafe, rise, forward]. */
  move?: Vec3Tuple;
  /** Degrees over the whole step: [pitch, yaw, roll]. */
  rotate?: Vec3Tuple;
};

export type HandControl = {
  /** Meters over the whole step, relative to the current local controller pose. */
  move?: Vec3Tuple;
  /** Degrees over the whole step, relative to the current local controller pose. */
  rotate?: Vec3Tuple;
  /** Begin the hand's primary select gesture. In the simulator this starts a pinch. */
  selectStart?: boolean;
  /** End the hand's primary select gesture. In the simulator this releases a pinch. */
  selectEnd?: boolean;
  /** Sparse angular joint targets in radians. */
  rotations?: SimulatorHandPoseRotations;
  visible?: boolean;
};

export type XRCompoundControl = {
  locomotion?: LocomotionControl;
  leftHand?: HandControl;
  rightHand?: HandControl;
};

export type EmbodiedControlStep = {
  id?: string;
  durationMs?: number;
  control: XRCompoundControl;
};

export type HandObservation = {
  position: Vec3Tuple;
  quaternion: QuatTuple;
  selected: boolean;
  squeezing: boolean;
  visible: boolean;
  rotations?: SimulatorHandPoseRotations;
};

export type EmbodiedControlObservation = {
  screenshot?: string;
  state: {
    camera: {
      position: Vec3Tuple;
      quaternion: QuatTuple;
    };
    leftHand: HandObservation;
    rightHand: HandObservation;
  };
};

export type EmbodiedControlStepResult = {
  id?: string;
  elapsedMs: number;
  observation: EmbodiedControlObservation;
};

export type EmbodiedControlOptions = {
  /** Pause the core after initialization so only explicit steps advance time. */
  autoPause?: boolean;
  /** Yield to animation frames while stepping so visual demos animate in real time. */
  realTime?: boolean;
  /** Simulated frame length used while executing a step. */
  tickMs?: number;
  /** Step duration used when a step omits durationMs. */
  defaultDurationMs?: number;
  /** Capture a screenshot in each completed observation. */
  includeScreenshot?: boolean;
  /** Clamp hand joint rotations through simulator biomechanical constraints. */
  applyHandRotationConstraints?: boolean;
};

export type EmbodiedControlExecutorOptions = Required<
  Pick<
    EmbodiedControlOptions,
    | 'tickMs'
    | 'defaultDurationMs'
    | 'includeScreenshot'
    | 'applyHandRotationConstraints'
    | 'realTime'
  >
>;

export const DEFAULT_EMBODIED_CONTROL_OPTIONS: Required<EmbodiedControlOptions> =
  {
    autoPause: true,
    realTime: false,
    tickMs: 16.67,
    defaultDurationMs: 250,
    includeScreenshot: true,
    applyHandRotationConstraints: true,
  };
