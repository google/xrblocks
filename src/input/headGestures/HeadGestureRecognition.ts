import * as THREE from 'three';

import {Script} from '../../core/Script';
import type {
  HeadGestureEventDetail,
  HeadGestureEventMap,
} from './HeadGestureEvents';
import {HeadGestureRecognitionOptions} from './HeadGestureRecognitionOptions';
import type {
  HeadGestureContext,
  HeadGestureScoreMap,
  HeadPoseSample,
} from './HeadGestureTypes';

export class HeadGestureRecognition extends Script<HeadGestureEventMap> {
  static dependencies = {
    camera: THREE.Camera,
    options: HeadGestureRecognitionOptions,
  };

  private camera!: THREE.Camera;
  private options!: HeadGestureRecognitionOptions;
  private samples: HeadPoseSample[] = [];
  private latchedGestures = new Set<string>();
  private lastEvaluation = -Infinity;
  private latestTimestamp = -Infinity;
  private pendingRecognition = false;
  private generation = 0;

  async init({
    camera,
    options,
  }: {
    camera: THREE.Camera;
    options: HeadGestureRecognitionOptions;
  }) {
    this.camera = camera;
    this.options = options;
    await this.options.gestureRecognizer.init?.();
  }

  update(time = performance.now()) {
    if (!this.options.enabled) return;

    const timestamp = Number.isFinite(time) ? time : performance.now();
    this.latestTimestamp = timestamp;
    const sample = this.captureSample(timestamp);
    const previous = this.samples.at(-1);
    if (previous && this.isDiscontinuity(previous, sample)) {
      this.resetRecognitionState();
    }
    this.samples.push(sample);
    this.pruneSamples(timestamp);

    const historyDuration =
      timestamp - (this.samples[0]?.timestamp ?? timestamp);
    if (historyDuration < this.options.warmupDurationMs) {
      return;
    }

    if (
      timestamp - this.lastEvaluation < this.options.updateIntervalMs ||
      this.pendingRecognition
    ) {
      return;
    }
    this.lastEvaluation = timestamp;
    this.evaluate({samples: this.samples.slice()}, timestamp);
  }

  private captureSample(timestamp: number): HeadPoseSample {
    return {
      timestamp,
      position: this.camera.getWorldPosition(new THREE.Vector3()),
      orientation: this.camera.getWorldQuaternion(new THREE.Quaternion()),
    };
  }

  private isDiscontinuity(previous: HeadPoseSample, next: HeadPoseSample) {
    return (
      next.timestamp - previous.timestamp > this.options.maximumSampleGapMs ||
      previous.orientation.angleTo(next.orientation) >
        this.options.maximumSampleAngleRadians
    );
  }

  private pruneSamples(timestamp: number) {
    const oldestTimestamp = timestamp - this.options.historyDurationMs;
    let firstRetained = 0;
    while (
      firstRetained < this.samples.length &&
      this.samples[firstRetained].timestamp < oldestTimestamp
    ) {
      firstRetained++;
    }
    if (firstRetained > 0) {
      this.samples.splice(0, firstRetained);
    }
  }

  private evaluate(context: HeadGestureContext, requestedAt: number) {
    const generation = this.generation;
    let result: HeadGestureScoreMap | Promise<HeadGestureScoreMap>;
    try {
      result = this.options.gestureRecognizer.recognize(context);
    } catch (error) {
      console.error('HeadGestureRecognition recognizer failed:', error);
      return;
    }

    if (result instanceof Promise) {
      this.pendingRecognition = true;
      result
        .then((scores) => {
          if (
            generation === this.generation &&
            this.latestTimestamp - requestedAt <= this.options.historyDurationMs
          ) {
            this.emitFromScores(scores);
          }
        })
        .catch((error) => {
          console.error('HeadGestureRecognition recognizer failed:', error);
        })
        .finally(() => {
          if (generation === this.generation) {
            this.pendingRecognition = false;
          }
        });
      return;
    }

    this.emitFromScores(result);
  }

  private emitFromScores(scores: HeadGestureScoreMap) {
    for (const [name, config] of Object.entries(this.options.gestures)) {
      if (!config.enabled) {
        this.latchedGestures.delete(name);
        continue;
      }

      const result = scores[name];
      const confidence = THREE.MathUtils.clamp(result?.confidence ?? 0, 0, 1);
      if (this.latchedGestures.has(name)) {
        if (confidence <= this.options.releaseConfidence) {
          this.latchedGestures.delete(name);
        }
        continue;
      }

      if (result && confidence >= this.options.minimumConfidence) {
        this.latchedGestures.add(name);
        this.emitGesture({
          name,
          confidence,
          data: result.data,
        });
      }
    }
  }

  private emitGesture(detail: HeadGestureEventDetail) {
    this.dispatchEvent({type: 'gesture', detail, target: this});
  }

  private resetRecognitionState() {
    this.samples.length = 0;
    this.latchedGestures.clear();
    this.lastEvaluation = -Infinity;
    this.generation++;
    this.pendingRecognition = false;
  }

  dispose() {
    this.resetRecognitionState();
    this.options.gestureRecognizer.dispose?.();
  }
}
