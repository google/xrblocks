import {deepMerge} from '../../utils/OptionsUtils';
import type {DeepPartial} from '../../utils/Types';

export class MeshDetectionOptions {
  showDebugVisualizations = false;
  enabled = false;

  constructor(options?: DeepPartial<MeshDetectionOptions>) {
    if (options) {
      deepMerge(this, options);
    }
  }

  /**
   * Enables the mesh detector.
   */
  enable() {
    this.enabled = true;
    return this;
  }
}
