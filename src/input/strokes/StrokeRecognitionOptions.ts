import {deepMerge} from '../../utils/OptionsUtils';
import {DeepPartial, DeepReadonly} from '../../utils/Types';
import {DEFAULT_SUPPORTED_SHAPES} from './providers/OneDollarUnistrokeRecognizer';
import {JointName} from '../Hands';

export type StrokeProvider = 'onedollar';

export class StrokeRecognitionOptions {
  /** Master switch for the stroke recognition block. */
  enabled = true;

  /**
   * Configuration for the stroke recognition provider.
   */
  providerConfig = {
    /**
     * Backing provider that recognizes strokes.
     *  - 'onedollar': $1 Unistroke recognizer.
     */
    provider: 'onedollar' as StrokeProvider,

    /**
     * Options specific to the 'onedollar' provider.
     */
    onedollar: {
      supportedShapes: DEFAULT_SUPPORTED_SHAPES,
    },
  };

  /**
   * Delay in seconds after gesture start before recording points.
   */
  startDelay = 0.2;

  /**
   * Delay in seconds to ignore points before gesture end.
   */
  endDelay = 0.2;

  /**
   * The hand joint to track for stroke recognition.
   */
  joint: JointName = 'index-finger-tip';

  /**
   * Maximum number of points to capture in a single stroke.
   */
  maxPoints = 1000;

  constructor(options?: DeepReadonly<DeepPartial<StrokeRecognitionOptions>>) {
    deepMerge(this, options);
  }

  enable() {
    this.enabled = true;
    return this;
  }
}
