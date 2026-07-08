import {deepMerge} from '../utils/OptionsUtils';
import {DeepPartial} from '../utils/Types';

import {MeshDetectionOptions} from './mesh/MeshDetectionOptions';
import {ObjectsOptions} from './objects/ObjectsOptions';
import {PlanesOptions} from './planes/PlanesOptions';
import {SoundsOptions} from './sounds/SoundsOptions';
import {HumansOptions} from './humans/HumansOptions';
import {FacesOptions} from './faces/FacesOptions';
import {SegmentationOptions} from './segmentation/SegmentationOptions';

export class WorldOptions {
  debugging = false;
  enabled = false;
  initiateRoomCapture = false;
  planes = new PlanesOptions();
  objects = new ObjectsOptions();
  meshes = new MeshDetectionOptions();
  sounds = new SoundsOptions();
  humans = new HumansOptions();
  faces = new FacesOptions();
  segmentation = new SegmentationOptions();

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

  /**
   * Enables sound detection.
   */
  enableSoundDetection() {
    this.enabled = true;
    this.sounds.enable();
    return this;
  }

  /**
   * Enables human detection.
   */
  enableHumanDetection() {
    this.enabled = true;
    this.humans.enable();
    return this;
  }

  /**
   * Enables face landmark detection.
   */
  enableFaceDetection() {
    this.enabled = true;
    this.faces.enable();
    return this;
  }

  /**
   * Enables semantic segmentation (person / background category masks).
   */
  enableSegmentation() {
    this.enabled = true;
    this.segmentation.enable();
    return this;
  }
}
