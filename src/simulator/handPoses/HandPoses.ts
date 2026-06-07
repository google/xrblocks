// Enum of hand poses.
export enum SimulatorHandPose {
  NEUTRAL = 'neutral',
  RELAXED = 'relaxed',
  PINCHING = 'pinching',
  FIST = 'fist',
  THUMBS_UP = 'thumbs_up',
  POINTING = 'pointing',
  ROCK = 'rock',
  THUMBS_DOWN = 'thumbs_down',
  VICTORY = 'victory',
}

export const SIMULATOR_HAND_POSE_NAMES: Readonly<
  Record<SimulatorHandPose, string>
> = Object.freeze({
  [SimulatorHandPose.NEUTRAL]: 'Neutral',
  [SimulatorHandPose.RELAXED]: 'Relaxed',
  [SimulatorHandPose.PINCHING]: 'Pinching',
  [SimulatorHandPose.FIST]: 'Fist',
  [SimulatorHandPose.THUMBS_UP]: 'Thumbs Up',
  [SimulatorHandPose.POINTING]: 'Pointing',
  [SimulatorHandPose.ROCK]: 'Rock',
  [SimulatorHandPose.THUMBS_DOWN]: 'Thumbs Down',
  [SimulatorHandPose.VICTORY]: 'Victory',
});
