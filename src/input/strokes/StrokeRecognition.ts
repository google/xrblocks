import * as THREE from 'three';

import {User} from '../../core/User';
import {Script} from '../../core/Script';

import {OneDollarUnistrokeRecognizer} from './providers/OneDollarUnistrokeRecognizer';
import {StrokeRecognitionOptions} from './StrokeRecognitionOptions';
import {Handedness} from '../Hands';
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
 * Represents the basis vectors and origin of a plane.
 */
interface PlaneBasis {
  origin: THREE.Vector3;
  u: THREE.Vector3;
  v: THREE.Vector3;
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
  private activeHand: Handedness = Handedness.LEFT;

  private scene!: THREE.Scene;
  private camera!: THREE.Camera;
  private user!: User;

  init({
    scene,
    camera,
    user,
    options,
  }: {
    scene: THREE.Scene;
    camera: THREE.Camera;
    user: User;
    options: StrokeRecognitionOptions;
  }) {
    this.scene = scene;
    this.camera = camera;
    this.user = user;
    this.options = options;

    this.configureProvider();

    if (!this.options.enabled) {
      console.info(
        'StrokeRecognizer initialized but disabled. Call options.enableStrokes() to activate.'
      );
    }
  }

  dispose() {}

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
   * Activates the stroke recognizer, enabling gesture tracking and recording.
   */
  activate() {
    this.isActive = true;
  }

  /**
   * Deactivates the stroke recognizer and clears any captured points.
   */
  deactivate() {
    this.isActive = false;
    this.clearPoints();
  }

  /**
   * Clears the list of captured points.
   */
  clearPoints() {
    this.capturedPoints = [];
  }

  /**
   * Adds a point to the current stroke if the maximum point limit has not been reached.
   * @param pos - The world position of the point.
   * @param timestamp - The timestamp when the point was captured.
   */
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
    // Ignore updates if the feature is disabled or recognizer is not active.
    if (!this.options.enabled) return;
    if (!this.isActive) return;

    const currentTime = Date.now() / 1000; // Use seconds

    // Check if the user is currently pinching (simulated or physical).
    if (this.user.isSelecting?.()) {
      // If this is the first frame of the pinch, initialize recording state.
      if (!this.isRecording) {
        this.isRecording = true;
        this.gestureStartTime = currentTime;
        this.clearPoints();

        // Identify which hand is actively pinching at the start of the gesture.
        this.activeHand = Handedness.LEFT;
        if (this.user.isSelecting?.(Handedness.LEFT))
          this.activeHand = Handedness.LEFT;
        else if (this.user.isSelecting?.(Handedness.RIGHT))
          this.activeHand = Handedness.RIGHT;

        this.dispatchEvent({type: 'unistrokestart', target: this, detail: {}});
      }

      const elapsedSincePinch = currentTime - this.gestureStartTime;

      // Wait for the start delay to avoid capturing the initial jitter of the pinch motion.
      if (elapsedSincePinch > this.options.startDelay) {
        // Retrieve the configured joint for tracking (e.g., index finger tip).
        const trackingJoint = this.user.hands?.getJoint(
          this.options.joint,
          this.activeHand
        );
        if (trackingJoint) {
          const worldPos = new THREE.Vector3();
          trackingJoint.getWorldPosition(worldPos);

          // Capture the point and notify listeners.
          this.addPoint(worldPos, currentTime);
          this.dispatchEvent({
            type: 'unistrokeupdate',
            target: this,
            detail: {point: worldPos},
          });
        }
      }
    } else {
      // If the user stopped pinching while we were recording, finalize the gesture.
      if (this.isRecording) {
        this.isRecording = false;
        this.gestureEndTime = currentTime;

        // Perform recognition and notify listeners of the result.
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
   * Calculates the best-fitting plane for a set of 3D points using a simple 3-point estimator.
   * Falls back to camera plane if points are collinear.
   */
  private calculateBestFittingPlane(
    points: THREE.Vector3[]
  ): PlaneBasis | null {
    if (points.length < 3) return null;

    const p0 = points[0];

    // Find point furthest from p0
    let p1 = p0;
    let maxDistSq = 0;
    for (const p of points) {
      const d = p.distanceToSquared(p0);
      if (d > maxDistSq) {
        maxDistSq = d;
        p1 = p;
      }
    }

    if (maxDistSq < 0.0001) return null; // All points are the same

    // Find point furthest from line p0-p1
    let p2 = p0;
    let maxLineDistSq = 0;
    const line = new THREE.Line3(p0, p1);
    const closestPoint = new THREE.Vector3();

    for (const p of points) {
      line.closestPointToPoint(p, false, closestPoint);
      const distSq = p.distanceToSquared(closestPoint);
      if (distSq > maxLineDistSq) {
        maxLineDistSq = distSq;
        p2 = p;
      }
    }

    // If maxLineDistSq is very small, points are collinear
    if (maxLineDistSq < 0.0001) {
      return null;
    }

    const origin = p0;
    const u = new THREE.Vector3().subVectors(p1, p0).normalize();

    // Use Three.Plane to calculate the normal from 3 coplanar points
    const plane = new THREE.Plane().setFromCoplanarPoints(p0, p1, p2);
    const v = new THREE.Vector3().crossVectors(plane.normal, u).normalize();

    return {origin, u, v};
  }

  /**
   * Filters captured points, projects them to a 2D plane, and calls the backend recognizer.
   * Uses best-fitting plane if possible, otherwise falls back to camera viewport plane.
   * @returns The recognition result or null if not enough points were captured.
   */
  private recognizeGesture() {
    const cutoffTime = this.gestureEndTime - this.options.endDelay;
    const filteredPoints = this.capturedPoints.filter(
      (p) => p.timestamp <= cutoffTime
    );

    if (filteredPoints.length > 10) {
      const points3D = filteredPoints.map((p) => p.pos);

      const bestFittingPlane = this.calculateBestFittingPlane(points3D);

      let points2D;
      if (bestFittingPlane) {
        points2D = points3D.map((p) => {
          const v = new THREE.Vector3().subVectors(p, bestFittingPlane.origin);
          return {x: v.dot(bestFittingPlane.u), y: v.dot(bestFittingPlane.v)};
        });
      } else {
        // Fallback to camera plane projection
        points2D = points3D.map((p) => {
          const localPos = p
            .clone()
            .applyMatrix4(this.camera.matrixWorldInverse);
          return {x: localPos.x, y: localPos.y};
        });
      }

      return this.recognizer.recognize(points2D);
    }
    return null;
  }
}
