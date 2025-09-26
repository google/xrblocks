import { SimulatorHandPose } from '../handPoses/HandPoses';
export declare class SimulatorHandPoseChangeRequestEvent extends Event {
    pose: SimulatorHandPose;
    static type: string;
    constructor(pose: SimulatorHandPose);
}
