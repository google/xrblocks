import {deepMerge} from '../utils/OptionsUtils';
import {DeepPartial, DeepReadonly} from '../utils/Types';

export class HandsOptions {
  /** Whether hand tracking is enabled. */
  enabled = false;
  /** Whether to show any hand visualization. */
  visualization = false;
  /** Whether to show the tracked hand joints. */
  visualizeJoints = false;
  /** Whether to show the virtual hand meshes. */
  visualizeMeshes = false;

  debugging = false;

  constructor(options?: DeepReadonly<DeepPartial<HandsOptions>>) {
    deepMerge(this, options);
  }

  /**
   * Enables hands tracking.
   * @returns The instance for chaining.
   */
  enableHands() {
    this.enabled = true;
    return this;
  }

  enableHandsVisualization() {
    this.enabled = true;
    this.visualization = true;
    return this;
  }
}
