import * as THREE from 'three';

import {Handedness} from '../Hands';
import {User} from '../../core/User';
import {Script} from '../../core/Script';
import {GestureEventDetail, GestureEventType} from './GestureEvents';
import {GestureRecognitionOptions} from './GestureRecognitionOptions';
import {
  HAND_INDEX_TO_LABEL,
  type GestureScoreMap,
  type HandContext,
  type HandLabel,
} from './GestureTypes';

type ActiveGestureState = {
  confidence: number;
  data?: Record<string, unknown>;
};

type GestureScriptEvent = THREE.Event & {
  type: GestureEventType;
  target: GestureRecognition;
  detail: GestureEventDetail;
};

interface GestureRecognitionEventMap extends THREE.Object3DEventMap {
  gesturestart: GestureScriptEvent;
  gestureupdate: GestureScriptEvent;
  gestureend: GestureScriptEvent;
}

export class GestureRecognition extends Script<GestureRecognitionEventMap> {
  static dependencies = {
    user: User,
    options: GestureRecognitionOptions,
  };

  private options!: GestureRecognitionOptions;
  private activeGestures: Record<HandLabel, Map<string, ActiveGestureState>> = {
    left: new Map(),
    right: new Map(),
  };
  private latestScores: Record<HandLabel, GestureScoreMap | null> = {
    left: null,
    right: null,
  };
  private pendingRecognition: Record<HandLabel, boolean> = {
    left: false,
    right: false,
  };
  private lastEvaluation = 0;

  async init({
    options,
    user,
  }: {
    options: GestureRecognitionOptions;
    user: User;
  }) {
    this.options = options;
    await this.options.poseEstimator.init?.({user});
    await this.options.gestureRecognizer.init?.();
    if (!this.options.enabled) {
      console.info(
        'GestureRecognition initialized but disabled. Call options.enableGestures() to activate.'
      );
    }
  }

  update() {
    if (!this.options.enabled) return;

    const now = performance.now();
    const interval = this.options.updateIntervalMs;
    if (interval > 0 && now - this.lastEvaluation < interval) {
      return;
    }
    this.lastEvaluation = now;

    this.evaluateHand(Handedness.LEFT);
    this.evaluateHand(Handedness.RIGHT);
  }

  private evaluateHand(handedness: Handedness) {
    const handLabel = HAND_INDEX_TO_LABEL[handedness];
    if (!handLabel) return;
    const activeMap = this.activeGestures[handLabel];

    const context = this.options.poseEstimator.getHandContext(handedness);
    if (!context) {
      for (const [name] of activeMap.entries()) {
        this.emitGesture('gestureend', {name, hand: handLabel, confidence: 0});
      }
      activeMap.clear();
      return;
    }

    this.recognizeHand(context);
    const scores = this.latestScores[handLabel];
    if (!scores) return;

    this.emitFromScores(handLabel, scores);
  }

  private recognizeHand(context: HandContext) {
    const handLabel = context.handLabel;
    if (this.pendingRecognition[handLabel]) return;

    const result = this.options.gestureRecognizer.recognize(context);
    if (result instanceof Promise) {
      this.pendingRecognition[handLabel] = true;
      result
        .then((scores) => {
          this.latestScores[handLabel] = scores;
        })
        .catch((error) => {
          console.error('GestureRecognition recognizer failed:', error);
        })
        .finally(() => {
          this.pendingRecognition[handLabel] = false;
        });
      return;
    }

    this.latestScores[handLabel] = result;
  }

  private emitFromScores(handLabel: HandLabel, scores: GestureScoreMap) {
    const activeMap = this.activeGestures[handLabel];
    const processed = new Set<string>();
    for (const [name, config] of Object.entries(this.options.gestures)) {
      const gestureName = name;
      if (!config?.enabled) continue;

      const result = scores[gestureName];
      const isActive =
        result && result.confidence >= this.options.minimumConfidence;
      processed.add(gestureName);
      const previousState = activeMap.get(gestureName);

      if (isActive) {
        const detail: GestureEventDetail = {
          name: gestureName,
          hand: handLabel,
          confidence: THREE.MathUtils.clamp(result.confidence, 0, 1),
          data: result.data,
        };
        if (!previousState) {
          activeMap.set(gestureName, {
            confidence: detail.confidence,
            data: detail.data,
          });
          this.emitGesture('gesturestart', detail);
        } else {
          previousState.confidence = detail.confidence;
          previousState.data = detail.data;
          this.emitGesture('gestureupdate', detail);
        }
      } else if (previousState) {
        activeMap.delete(gestureName);
        this.emitGesture('gestureend', {
          name: gestureName,
          hand: handLabel,
          confidence: 0.0,
        });
      }
    }

    for (const name of Array.from(activeMap.keys())) {
      if (!processed.has(name)) {
        activeMap.delete(name);
        this.emitGesture('gestureend', {
          name,
          hand: handLabel,
          confidence: 0.0,
        });
      }
    }
  }

  private emitGesture(type: GestureEventType, detail: GestureEventDetail) {
    const event: GestureScriptEvent = {type, detail, target: this};
    this.dispatchEvent(event);
  }

  dispose() {
    this.options.poseEstimator.dispose?.();
    this.options.gestureRecognizer.dispose?.();
  }
}
