import {deepMerge} from '../../utils/OptionsUtils';
import {DeepPartial} from '../../utils/Types'

export class PlanesOptions {
  debugging = false;
  enabled = false;
  showDebugVisualizations = false;

  constructor(options?: DeepPartial<PlanesOptions>) {
    if (options) {
      deepMerge(this, options);
    }
  }

  enable() {
    this.enabled = true;
    return this;
  }
}
