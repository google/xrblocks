import {deepMerge} from '../../utils/OptionsUtils';
import type {DeepPartial, DeepReadonly} from '../../utils/Types';
import {HeuristicHeadGestureRecognizer} from './gestureRecognizers/HeuristicHeadGestureRecognizer';
import type {
  HeadGestureConfiguration,
  HeadGestureRecognizer,
} from './HeadGestureTypes';

export class HeadGestureRecognitionOptions {
  enabled = false;

  minimumConfidence = 0.6;

  releaseConfidence = 0.4;

  updateIntervalMs = 16;

  historyDurationMs = 1500;

  warmupDurationMs = 200;

  maximumSampleGapMs = 250;

  maximumSampleAngleRadians = Math.PI / 3;

  gestureRecognizer: HeadGestureRecognizer =
    new HeuristicHeadGestureRecognizer();

  gestures: Record<string, HeadGestureConfiguration> = {};

  constructor(
    options?: DeepReadonly<DeepPartial<HeadGestureRecognitionOptions>>
  ) {
    if (options) {
      const {gestureRecognizer, gestures, ...baseOptions} = options;
      deepMerge(this, baseOptions);

      if (gestureRecognizer) {
        this.gestureRecognizer = gestureRecognizer as HeadGestureRecognizer;
      }

      this.applyGestureRecognizerConfigurations();

      if (gestures) {
        for (const [name, config] of Object.entries(gestures)) {
          this.setGestureConfig(
            name,
            config as Partial<HeadGestureConfiguration>
          );
        }
      }
      return;
    }

    this.applyGestureRecognizerConfigurations();
  }

  enable() {
    this.enabled = true;
    return this;
  }

  setGestureEnabled(name: string, enabled: boolean) {
    return this.setGestureConfig(name, {enabled});
  }

  setGestureRecognizer(gestureRecognizer: HeadGestureRecognizer) {
    this.gestureRecognizer = gestureRecognizer;
    this.gestures = {};
    this.applyGestureRecognizerConfigurations();
    return this;
  }

  setGestureConfig(name: string, config: Partial<HeadGestureConfiguration>) {
    const mergedConfig = {
      ...this.gestures[name],
      enabled: this.gestures[name]?.enabled ?? true,
    } as HeadGestureConfiguration;
    deepMerge(mergedConfig, config);
    this.gestures[name] = mergedConfig;
    this.gestureRecognizer.setGestureConfig?.(name, mergedConfig);
    return this;
  }

  private applyGestureRecognizerConfigurations() {
    const configs = this.gestureRecognizer.getGestureConfigurations?.() ?? {};
    for (const [name, config] of Object.entries(configs)) {
      this.setGestureConfig(name, config);
    }
  }
}
