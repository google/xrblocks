import * as THREE from 'three';
import {GestureRecognition} from '../gestures/GestureRecognition';
import {User} from '../../core/User';
import {Script} from '../../core/Script';

import {OneDollarUnistrokeRecognizer} from './providers/OneDollarUnistrokeRecognizer';

export interface StrokeEventMap extends THREE.Object3DEventMap {
  unistroke_started: THREE.Event & {type: 'unistroke_started'};
  unistroke_updated: THREE.Event & {
    type: 'unistroke_updated';
    point: THREE.Vector3;
  };
  unistroke_ended: THREE.Event & {
    type: 'unistroke_ended';
    result: {name: string; score: number; points3D: THREE.Vector3[]} | null;
  };
}

export class StrokeRecognizer extends Script<StrokeEventMap> {
  static dependencies = {
    scene: THREE.Scene,
    camera: THREE.Camera,
    gestureRecognition: GestureRecognition,
    user: User,
  };

  private recognizer = new OneDollarUnistrokeRecognizer();
  private maxPoints = 1000;
  private capturedPoints: Array<{pos: THREE.Vector3; timestamp: number}> = [];
  private isActive = false;
  private isRecording = false;
  private pinchStartTime = 0;
  private pinchEndTime = 0;
  private startDelay = 0.2;
  private endDelay = 0.2;
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
  }: {
    scene: THREE.Scene;
    camera: THREE.Camera;
    gestureRecognition: GestureRecognition;
    user: User;
  }) {
    this.scene = scene;
    this.camera = camera;
    this.gestureRecognition = gestureRecognition;
    this.user = user;

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

  private onGestureStart = (e: any) => {
    if (e.detail.name === 'pinch') {
      if (!this.isPinching) {
        this.isPinching = true;
        this.activeHandLabel = e.detail.hand;
      }
    }
  };

  private onGestureEnd = (e: any) => {
    if (e.detail.name === 'pinch' && e.detail.hand === this.activeHandLabel) {
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
    if (this.capturedPoints.length < this.maxPoints) {
      this.capturedPoints.push({pos: pos.clone(), timestamp: timestamp});
    }
  }

  update() {
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
        this.dispatchEvent({type: 'unistroke_started', target: this});
      }

      const elapsedSincePinch = currentTime - this.pinchStartTime;

      if (elapsedSincePinch > this.startDelay) {
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
            type: 'unistroke_updated',
            target: this,
            point: worldPos,
          });
        }
      }
    } else {
      if (this.isRecording) {
        this.isRecording = false;
        this.pinchEndTime = currentTime;
        const result = this.recognizeGesture();
        this.dispatchEvent({type: 'unistroke_ended', target: this, result});
      }
    }
  }

  private recognizeGesture() {
    const cutoffTime = this.pinchEndTime - this.endDelay;
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

      const result = this.recognizer.recognize(points2D);
      return {
        name: result.name,
        score: result.score,
        points3D: points3D, // Return points for shooting shape
      };
    }
    return null;
  }
}
