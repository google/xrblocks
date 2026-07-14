import {deepMerge} from '../../utils/OptionsUtils';
import {DeepPartial} from '../../utils/Types';

class SceneDerivedContextOptions {
  enabled = false;

  constructor(options?: DeepPartial<SceneDerivedContextOptions>) {
    if (options) {
      deepMerge(this, options);
    }
  }

  enable() {
    this.enabled = true;
    return this;
  }
}

export class SceneVisibilityOptions extends SceneDerivedContextOptions {
  /**
   * Raycast hits on materials with effective opacity less than or equal to this
   * threshold are ignored for line-of-sight occlusion.
   */
  occlusionOpacityThreshold = 0;
}
export class SceneSetOfMarkOptions extends SceneDerivedContextOptions {}

export class SceneOptions {
  enabled = false;
  pollingIntervalMs = 3000;
  visibleObjects = new SceneVisibilityOptions();
  som = new SceneSetOfMarkOptions();

  constructor(options?: DeepPartial<SceneOptions>) {
    if (options) {
      deepMerge(this, options);
    }
  }

  enable() {
    this.enabled = true;
    return this;
  }

  enableVisibleObjects() {
    this.enabled = true;
    this.visibleObjects.enable();
    return this;
  }

  enableSetOfMark() {
    this.enabled = true;
    this.som.enable();
    return this;
  }
}
