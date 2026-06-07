import type {DeepReadonly} from '../../../utils/Types';
import type {GestureConfiguration} from '../GestureRecognitionOptions';
import type {
  HeuristicGestureDetector,
  GestureRecognizer,
  GestureScoreMap,
  HandContext,
} from '../GestureTypes';
import {
  detectFist,
  detectOpenPalm,
  detectPinch,
  detectPoint,
  detectSpread,
  detectThumbsDown,
  detectThumbsUp,
} from './BuiltInHeuristicGestures';

type RegisteredGesture = {
  detector: HeuristicGestureDetector;
  config: GestureConfiguration;
};

export class HeuristicGestureRecognizer implements GestureRecognizer {
  private gestures = new Map<string, RegisteredGesture>();

  constructor(initBuiltInGestures = true) {
    if (initBuiltInGestures) {
      this.registerBuiltInGestures();
    }
  }

  registerGesture(
    name: string,
    detector: HeuristicGestureDetector,
    config: DeepReadonly<Partial<GestureConfiguration>> = {}
  ) {
    this.gestures.set(name, {
      detector,
      config: {
        enabled: true,
        ...config,
      },
    });
    return this;
  }

  unregisterGesture(name: string) {
    this.gestures.delete(name);
    return this;
  }

  getGestureConfigurations(): Record<string, GestureConfiguration> {
    const configs: Record<string, GestureConfiguration> = {};
    for (const [name, gesture] of this.gestures.entries()) {
      configs[name] = {...gesture.config};
    }
    return configs;
  }

  recognize(context: HandContext): GestureScoreMap {
    const scores: GestureScoreMap = {};
    for (const [name, gesture] of this.gestures.entries()) {
      scores[name] = gesture.detector(context, gesture.config);
    }
    return scores;
  }

  private registerBuiltInGestures() {
    this.registerGesture('pinch', detectPinch, {
      enabled: true,
      threshold: 0.025,
    });
    this.registerGesture('open-palm', detectOpenPalm);
    this.registerGesture('fist', detectFist);
    this.registerGesture('thumbs-up', detectThumbsUp);
    this.registerGesture('thumbs-down', detectThumbsDown);
    this.registerGesture('point', detectPoint, {enabled: false});
    this.registerGesture('spread', detectSpread, {
      enabled: false,
      threshold: 0.04,
    });
  }
}
