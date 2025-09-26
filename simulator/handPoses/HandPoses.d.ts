import type { DeepReadonly } from '../../utils/Types';
import type { SimulatorHandPoseJoints } from './HandPoseJoints';
export declare enum SimulatorHandPose {
    RELAXED = "relaxed",
    PINCHING = "pinching",
    FIST = "fist",
    THUMBS_UP = "thumbs_up",
    POINTING = "pointing",
    ROCK = "rock",
    THUMBS_DOWN = "thumbs_down",
    VICTORY = "victory"
}
export declare const SIMULATOR_HAND_POSE_TO_JOINTS_LEFT: DeepReadonly<Record<SimulatorHandPose, SimulatorHandPoseJoints>>;
export declare const SIMULATOR_HAND_POSE_TO_JOINTS_RIGHT: DeepReadonly<Record<SimulatorHandPose, SimulatorHandPoseJoints>>;
export declare const SIMULATOR_HAND_POSE_NAMES: Readonly<Record<SimulatorHandPose, string>>;
