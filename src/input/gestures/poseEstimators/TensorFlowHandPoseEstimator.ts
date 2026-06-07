import {Handedness} from '../../Hands';
import {HandContext, PoseEstimator} from '../GestureTypes';

export class TensorFlowHandPoseEstimator implements PoseEstimator {
  async init() {}

  getHandContext(_handedness: Handedness): HandContext | null {
    // TODO: map TensorFlow hand-pose outputs into canonical XR Blocks JointName positions.
    return null;
  }

  getHandContexts(): Partial<Record<'left' | 'right', HandContext>> {
    // TODO: return canonical contexts once TensorFlow output mapping is wired.
    return {};
  }
}
