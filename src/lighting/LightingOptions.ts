import {deepMerge} from '../utils/OptionsUtils.js';
import {DeepPartial, DeepReadonly} from '../utils/Types';

/**
 * Default options for controlling Lighting module features.
 */
export class LightingOptions {
  /** Enables debugging renders and logs. */
  debugging = false;
  /** Enables XR lighting. */
  enabled = false;
  /** Add ambient spherical harmonics to lighting. */
  useAmbientSH = false;
  /** Add main diredtional light to lighting. */
  useDirectionalLight = false;
  /** Cast shadows using diretional light. */
  castDirectionalLightShadow = false;
  /**
   * Adjust hardness of shadows according to relative brightness of main light.
   */
  useDynamicSoftShadow = false;  // experimental

  constructor(options?: DeepReadonly<DeepPartial<LightingOptions>>) {
    deepMerge(this, options);
  }
}
