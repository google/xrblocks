import * as THREE from 'three';
import {GestureRecognition} from '../gestures/GestureRecognition';
import {GestureEvent} from '../gestures/GestureEvents';
import {User} from '../../core/User';
import {Script} from '../../core/Script';

import {OneDollarUnistrokeRecognizer} from './providers/OneDollarUnistrokeRecognizer';
import {StrokeRecognitionOptions} from './StrokeRecognitionOptions';
import {
  StrokeRecognizerBackend,
  StrokeRecognitionResult,
} from './StrokeRecognizerBackend';

/**
 * Types of events emitted by the StrokeRecognizer.
 */
type UnistrokeEventType = 'unistrokestart' | 'unistrokeupdate' | 'unistrokeend';

/**
 * Detail payload for Unistroke events.
 */
interface UnistrokeEventDetail {
  /** The current world position of the tracked joint (for updates). */
  point?: THREE.Vector3;
  /** The result of the stroke recognition (for end event). */
  result?: StrokeRecognitionResult;
}

/**
 * Custom event for unistroke interactions.
 */
type UnistrokeEvent = THREE.Event & {
  type: UnistrokeEventType;
  target: StrokeRecognizer;
  detail: UnistrokeEventDetail;
};

/**
 * Event map for the StrokeRecognizer, defining the events it can dispatch.
 */
export interface StrokeEventMap extends THREE.Object3DEventMap {
  unistrokestart: UnistrokeEvent;
  unistrokeupdate: UnistrokeEvent;
  unistrokeend: UnistrokeEvent;
}

/**
 * Represents a point captured during a stroke gesture.
 */
interface CapturedPoint {
  /** World position of the point. */
  pos: THREE.Vector3;
  /** Timestamp when the point was captured (in seconds). */
  timestamp: number;
}

/**
 * StrokeRecognizer is a framework Script that handles recording hand stroke gestures
 * and recognizing them as geometric shapes using a configured provider.
 * It listens to gesture events and tracks specified hand joints to record the path.
 */
export class StrokeRecognizer extends Script<StrokeEventMap> {
  static dependencies = {
    scene: THREE.Scene,
    camera: THREE.Camera,
    gestureRecognition: GestureRecognition,
    user: User,
    options: StrokeRecognitionOptions,
  };

  private options!: StrokeRecognitionOptions;
  private recognizer!: StrokeRecognizerBackend;
  private capturedPoints: Array<CapturedPoint> = [];
  private isActive = false;
  private isRecording = false;
  private gestureStartTime = 0;
  private gestureEndTime = 0;
  private isGestureActive = false;
  private activeHandLabel: 'left' | 'right' | null = null;

  private scene!: THREE.Scene;
  private camera!: THREE.Camera;
  private gestureRecognition!: GestureRecognition;
  private user!: User;

  init({
    scene,
    camera,
    gestureRecognition,
    user,
    options,
  }: {
    scene: THREE.Scene;
    camera: THREE.Camera;
    gestureRecognition: GestureRecognition;
    user: User;
    options: StrokeRecognitionOptions;
  }) {
    this.scene = scene;
    this.camera = camera;
    this.gestureRecognition = gestureRecognition;
    this.user = user;
    this.options = options;

    this.configureProvider();

    if (!this.options.enabled) {
      console.info(
        'StrokeRecognizer initialized but disabled. Call options.enableStrokes() to activate.'
      );
    }

    this.gestureRecognition.addEventListener(
      'gesturestart',
      this.onGestureStart
    );
    this.gestureRecognition.addEventListener('gestureend', this.onGestureEnd);
  }

  dispose() {
    this.gestureRecognition.removeEventListener(
      'gesturestart',
      this.onGestureStart
    );
    this.gestureRecognition.removeEventListener(
      'gestureend',
      this.onGestureEnd
    );
  }

  private configureProvider() {
    const provider = this.options.providerConfig.provider;
    switch (provider) {
      case 'onedollar':
        this.recognizer = new OneDollarUnistrokeRecognizer({
          camera: this.camera,
          scene: this.scene,
          supportedShapes:
            this.options.providerConfig.onedollar.supportedShapes,
        });
        break;
      default:
        console.warn(
          `StrokeRecognizer: provider '${provider}' is unknown; falling back to 'onedollar'.`
        );
        this.recognizer = new OneDollarUnistrokeRecognizer({
          camera: this.camera,
          scene: this.scene,
          supportedShapes:
            this.options.providerConfig.onedollar.supportedShapes,
        });
        break;
    }
  }

  /**
   * Handler for gesture start events. Activates tracking if the gesture matches the configured one.
   */
  private onGestureStart = (e: GestureEvent) => {
    if (e.detail.name === this.options.gesture) {
      if (!this.isGestureActive) {
        this.isGestureActive = true;
        this.activeHandLabel = e.detail.hand;
      }
    }
  };

  /**
   * Handler for gesture end events. Deactivates tracking if the active hand ends the gesture.
   */
  private onGestureEnd = (e: GestureEvent) => {
    if (
      e.detail.name === this.options.gesture &&
      e.detail.hand === this.activeHandLabel
    ) {
      this.isGestureActive = false;
      this.activeHandLabel = null;
    }
  };

  activate() {
    this.isActive = true;
  }

  deactivate() {
    this.isActive = false;
    this.clearPoints();
  }

  clearPoints() {
    this.capturedPoints = [];
  }

  addPoint(pos: THREE.Vector3, timestamp: number) {
    if (this.capturedPoints.length < this.options.maxPoints) {
      this.capturedPoints.push({pos: pos.clone(), timestamp: timestamp});
    }
  }

  /**
   * Main update loop. Handles recording points during an active gesture
   * and triggers recognition when the gesture ends.
   */
  update() {
    if (!this.options.enabled) return;
    if (!this.isActive) return;

    const currentTime = Date.now() / 1000; // Use seconds
    const isSimulatorPinching =
      this.user.isSelecting?.(0) || this.user.isSelecting?.(1);
    const isGestureActive = this.isGestureActive || isSimulatorPinching;

    if (isGestureActive) {
      if (!this.isRecording) {
        this.isRecording = true;
        this.gestureStartTime = currentTime;
        this.clearPoints();
        this.dispatchEvent({type: 'unistrokestart', target: this, detail: {}});
      }

      const elapsedSincePinch = currentTime - this.gestureStartTime;

      if (elapsedSincePinch > this.options.startDelay) {
        let handEnum = this.activeHandLabel === 'left' ? 0 : 1;
        if (!this.isGestureActive && isSimulatorPinching) {
          if (this.user.isSelecting?.(0)) handEnum = 0;
          else if (this.user.isSelecting?.(1)) handEnum = 1;
        }

        const trackingJoint = this.user.hands?.getJoint(
          this.options.joint,
          handEnum
        );
        if (trackingJoint) {
          const worldPos = new THREE.Vector3();
          trackingJoint.getWorldPosition(worldPos);
          this.addPoint(worldPos, currentTime);
          this.dispatchEvent({
            type: 'unistrokeupdate',
            target: this,
            detail: {point: worldPos},
          });
        }
      }
    } else {
      if (this.isRecording) {
        this.isRecording = false;
        this.gestureEndTime = currentTime;
        const result = this.recognizeGesture();
        this.dispatchEvent({
          type: 'unistrokeend',
          target: this,
          detail: result ? {result} : {},
        });
      }
    }
  }

  /**
   * Filters captured points, projects them to 2D camera space, and calls the backend recognizer.
   * @returns The recognition result or null if not enough points were captured.
   */
  private recognizeGesture() {
    const cutoffTime = this.gestureEndTime - this.options.endDelay;
    const filteredPoints = this.capturedPoints.filter(
      (p) => p.timestamp <= cutoffTime
    );

    if (filteredPoints.length > 10) {
      const points3D = filteredPoints.map((p) => p.pos);

      // Project 3D points to 2D camera local space
      const points2D = points3D.map((p) => {
        const localPos = p.clone().applyMatrix4(this.camera.matrixWorldInverse);
        return {x: localPos.x, y: localPos.y};
      });

      return this.recognizer.recognize(points2D);
    }
    return null;
  }
}
