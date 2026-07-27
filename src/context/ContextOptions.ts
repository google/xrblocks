import {deepMerge} from '../utils/OptionsUtils';
import {DeepPartial} from '../utils/Types';

import {SceneOptions} from './scene/SceneOptions';

export {
  SceneOptions,
  SceneSetOfMarkOptions,
  SceneVisibilityOptions,
} from './scene/SceneOptions';

export class ContextOptions {
  debugging = false;
  enabled = false;
  scene = new SceneOptions();

  constructor(options?: DeepPartial<ContextOptions>) {
    if (options) {
      deepMerge(this, options);
    }
  }

  enable() {
    this.enabled = true;
    this.scene.enable();
    this.scene.enableVisibleObjects();
    this.scene.enableSetOfMark();
    return this;
  }

  enableScene() {
    this.enabled = true;
    this.scene.enable();
    return this;
  }

  enableVisibleObjects() {
    this.enabled = true;
    this.scene.enableVisibleObjects();
    return this;
  }

  enableSetOfMark() {
    this.enabled = true;
    this.scene.enableSetOfMark();
    return this;
  }
}
