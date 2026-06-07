import {deepMerge} from '../../utils/OptionsUtils';
import {DeepPartial, DeepReadonly} from '../../utils/Types';
import type {GestureRecognizer, PoseEstimator} from './GestureTypes';
import {HeuristicGestureRecognizer} from './gestureRecognizers/HeuristicGestureRecognizer';
import {WebXRHandPoseEstimator} from './poseEstimators/WebXRHandPoseEstimator';

export type GestureConfiguration = {
  enabled: boolean;
  threshold?: number;
};

export class GestureRecognitionOptions {
  enabled = false;

  minimumConfidence = 0.6;

  updateIntervalMs = 33;

  poseEstimator: PoseEstimator = new WebXRHandPoseEstimator();

  gestureRecognizer: GestureRecognizer = new HeuristicGestureRecognizer();

  gestures: Record<string, GestureConfiguration> = {};

  constructor(options?: DeepReadonly<DeepPartial<GestureRecognitionOptions>>) {
    if (options) {
      const {poseEstimator, gestureRecognizer, gestures, ...baseOptions} =
        options;
      deepMerge(this, baseOptions);

      if (poseEstimator) {
        this.poseEstimator = poseEstimator as PoseEstimator;
      }
      if (gestureRecognizer) {
        this.gestureRecognizer = gestureRecognizer as GestureRecognizer;
      }

      this.applyGestureRecognizerConfigurations();

      if (gestures) {
        for (const [name, config] of Object.entries(gestures)) {
          this.setGestureConfig(name, config as Partial<GestureConfiguration>);
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
    this.gestures[name] ??= {enabled};
    this.gestures[name].enabled = enabled;
    return this;
  }

  setPoseEstimator(poseEstimator: PoseEstimator) {
    this.poseEstimator = poseEstimator;
    return this;
  }

  setGestureRecognizer(gestureRecognizer: GestureRecognizer) {
    this.gestureRecognizer = gestureRecognizer;
    this.gestures = {};
    this.applyGestureRecognizerConfigurations();
    return this;
  }

  setGestureConfig(name: string, config: Partial<GestureConfiguration>) {
    const mergedConfig = {
      ...this.gestures[name],
      enabled: this.gestures[name]?.enabled ?? true,
    } as GestureConfiguration;
    deepMerge(mergedConfig, config);
    this.gestures[name] = mergedConfig;
    return this;
  }

  private applyGestureRecognizerConfigurations() {
    const configs = this.gestureRecognizer.getGestureConfigurations?.() ?? {};
    for (const [name, config] of Object.entries(configs)) {
      this.setGestureConfig(name, config);
    }
  }
}
