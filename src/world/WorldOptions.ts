import {deepMerge} from '../utils/OptionsUtils';
import {DeepPartial} from '../utils/Types';

import {MeshDetectionOptions} from './mesh/MeshDetectionOptions';
import {ObjectsOptions} from './objects/ObjectsOptions';
import {PlanesOptions} from './planes/PlanesOptions';

export class WorldOptions {
  debugging = false;
  enabled = false;
  initiateRoomCapture = false;
  planes = new PlanesOptions();
  objects = new ObjectsOptions();
  meshes = new MeshDetectionOptions();

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

  /**
   * Enables mesh detection.
   */
  enableMeshDetection() {
    this.enabled = true;
    this.meshes.enable();
    return this;
  }
}
