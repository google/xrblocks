import {deepMerge} from '../utils/OptionsUtils';
import {DeepPartial} from '../utils/Types'

import {ObjectsOptions} from './objects/ObjectsOptions';
import {PlanesOptions} from './planes/PlanesOptions';

export class WorldOptions {
  debugging = false;
  enabled = false;
  planes = new PlanesOptions();
  objects = new ObjectsOptions();

  constructor(options?: DeepPartial<WorldOptions>) {
    if (options) {
      deepMerge(this, options);
    }
  }

  /**
   * Enables plane detection.
   */
  enablePlaneDetection() {
    this.enabled = true;
    this.planes.enable();
    return this;
  }

  /**
   * Enables object detection.
   */
  enableObjectDetection() {
    this.enabled = true;
    this.objects.enable();
    return this;
  }
}
