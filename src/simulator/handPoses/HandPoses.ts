import type {DeepReadonly} from '../../utils/Types';

import {LEFT_HAND_FIST, RIGHT_HAND_FIST} from './FistHandPoses';
import type {SimulatorHandPoseJoints} from './HandPoseJoints';
import {LEFT_HAND_PINCHING, RIGHT_HAND_PINCHING} from './PinchingHandPoses';
import {LEFT_HAND_POINTING, RIGHT_HAND_POINTING} from './PointingHandPoses';
import {LEFT_HAND_RELAXED, RIGHT_HAND_RELAXED} from './RelaxedHandPoses';
import {LEFT_HAND_ROCK, RIGHT_HAND_ROCK} from './RockHandPoses';
import {LEFT_HAND_THUMBS_DOWN, RIGHT_HAND_THUMBS_DOWN} from './ThumbsDownPoses';
import {LEFT_HAND_THUMBS_UP, RIGHT_HAND_THUMBS_UP} from './ThumbsUpPoses';
import {LEFT_HAND_VICTORY, RIGHT_HAND_VICTORY} from './VictoryHandPoses';

// Enum of hand poses.
export enum SimulatorHandPose {
  RELAXED = 'relaxed',
  PINCHING = 'pinching',
  FIST = 'fist',
  THUMBS_UP = 'thumbs_up',
  POINTING = 'pointing',
  ROCK = 'rock',
  THUMBS_DOWN = 'thumbs_down',
  VICTORY = 'victory'
}

export const SIMULATOR_HAND_POSE_TO_JOINTS_LEFT:
    DeepReadonly<Record<SimulatorHandPose, SimulatorHandPoseJoints>> =
        Object.freeze({
          [SimulatorHandPose.RELAXED]: LEFT_HAND_RELAXED,
          [SimulatorHandPose.PINCHING]: LEFT_HAND_PINCHING,
          [SimulatorHandPose.FIST]: LEFT_HAND_FIST,
          [SimulatorHandPose.THUMBS_UP]: LEFT_HAND_THUMBS_UP,
          [SimulatorHandPose.POINTING]: LEFT_HAND_POINTING,
          [SimulatorHandPose.ROCK]: LEFT_HAND_ROCK,
          [SimulatorHandPose.THUMBS_DOWN]: LEFT_HAND_THUMBS_DOWN,
          [SimulatorHandPose.VICTORY]: LEFT_HAND_VICTORY
        } as const);

export const SIMULATOR_HAND_POSE_TO_JOINTS_RIGHT:
    DeepReadonly<Record<SimulatorHandPose, SimulatorHandPoseJoints>> =
        Object.freeze({
          [SimulatorHandPose.RELAXED]: RIGHT_HAND_RELAXED,
          [SimulatorHandPose.PINCHING]: RIGHT_HAND_PINCHING,
          [SimulatorHandPose.FIST]: RIGHT_HAND_FIST,
          [SimulatorHandPose.THUMBS_UP]: RIGHT_HAND_THUMBS_UP,
          [SimulatorHandPose.POINTING]: RIGHT_HAND_POINTING,
          [SimulatorHandPose.ROCK]: RIGHT_HAND_ROCK,
          [SimulatorHandPose.THUMBS_DOWN]: RIGHT_HAND_THUMBS_DOWN,
          [SimulatorHandPose.VICTORY]: RIGHT_HAND_VICTORY
        });

export const SIMULATOR_HAND_POSE_NAMES:
    Readonly<Record<SimulatorHandPose, string>> = Object.freeze({
      [SimulatorHandPose.RELAXED]: 'Relaxed',
      [SimulatorHandPose.PINCHING]: 'Pinching',
      [SimulatorHandPose.FIST]: 'Fist',
      [SimulatorHandPose.THUMBS_UP]: 'Thumbs Up',
      [SimulatorHandPose.POINTING]: 'Pointing',
      [SimulatorHandPose.ROCK]: 'Rock',
      [SimulatorHandPose.THUMBS_DOWN]: 'Thumbs Down',
      [SimulatorHandPose.VICTORY]: 'Victory'
    });
