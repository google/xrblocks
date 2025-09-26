import {SimulatorHandPose} from '../handPoses/HandPoses';

// Request to change the hand pose.
export class SimulatorHandPoseChangeRequestEvent extends Event {
  static type = 'SimulatorHandPoseChangeRequestEvent';
  constructor(public pose: SimulatorHandPose) {
    super(
        SimulatorHandPoseChangeRequestEvent.type,
        {bubbles: true, composed: true});
  }
}
