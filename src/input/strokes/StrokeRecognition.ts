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

type UnistrokeEventType = 'unistrokestart' | 'unistrokeupdate' | 'unistrokeend';

interface UnistrokeEventDetail {
  point?: THREE.Vector3;
  result?: StrokeRecognitionResult;
}

type UnistrokeEvent = THREE.Event & {
  type: UnistrokeEventType;
  target: StrokeRecognizer;
  detail: UnistrokeEventDetail;
};

export interface StrokeEventMap extends THREE.Object3DEventMap {
  unistrokestart: UnistrokeEvent;
  unistrokeupdate: UnistrokeEvent;
  unistrokeend: UnistrokeEvent;
}

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
  private capturedPoints: Array<{pos: THREE.Vector3; timestamp: number}> = [];
  private isActive = false;
  private isRecording = false;
  private pinchStartTime = 0;
  private pinchEndTime = 0;
  private isPinching = false;
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
          supportedShapes: this.options.providerConfig.onedollar.templates,
        });
        break;
      default:
        console.warn(
          `StrokeRecognizer: provider '${provider}' is unknown; falling back to 'onedollar'.`
        );
        this.recognizer = new OneDollarUnistrokeRecognizer({
          camera: this.camera,
          scene: this.scene,
          supportedShapes: this.options.providerConfig.onedollar.templates,
        });
        break;
    }
  }

  private onGestureStart = (e: GestureEvent) => {
    if (e.detail.name === this.options.gesture) {
      if (!this.isPinching) {
        this.isPinching = true;
        this.activeHandLabel = e.detail.hand;
      }
    }
  };

  private onGestureEnd = (e: GestureEvent) => {
    if (
      e.detail.name === this.options.gesture &&
      e.detail.hand === this.activeHandLabel
    ) {
      this.isPinching = false;
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

  update() {
    if (!this.options.enabled) return;
    if (!this.isActive) return;

    const currentTime = Date.now() / 1000; // Use seconds
    const isSimulatorPinching =
      this.user.isSelecting?.(0) || this.user.isSelecting?.(1);
    const isPinching = this.isPinching || isSimulatorPinching;

    if (isPinching) {
      if (!this.isRecording) {
        this.isRecording = true;
        this.pinchStartTime = currentTime;
        this.clearPoints();
        this.dispatchEvent({type: 'unistrokestart', target: this, detail: {}});
      }

      const elapsedSincePinch = currentTime - this.pinchStartTime;

      if (elapsedSincePinch > this.options.startDelay) {
        let handEnum = this.activeHandLabel === 'left' ? 0 : 1;
        if (!this.isPinching && isSimulatorPinching) {
          if (this.user.isSelecting?.(0)) handEnum = 0;
          else if (this.user.isSelecting?.(1)) handEnum = 1;
        }

        const hand = this.user.hands?.hands[handEnum];
        const indexTip = hand?.joints['index-finger-tip'];
        if (indexTip) {
          const worldPos = new THREE.Vector3();
          indexTip.getWorldPosition(worldPos);
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
        this.pinchEndTime = currentTime;
        const result = this.recognizeGesture();
        this.dispatchEvent({
          type: 'unistrokeend',
          target: this,
          detail: result ? {result} : {},
        });
      }
    }
  }

  private recognizeGesture() {
    const cutoffTime = this.pinchEndTime - this.options.endDelay;
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
