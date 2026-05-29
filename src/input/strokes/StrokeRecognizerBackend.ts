import * as THREE from 'three';

/**
 * Represents a 2D point in normalized device coordinates or screen space.
 */
export interface Point2D {
  x: number;
  y: number;
}

/**
 * Context provided to the stroke recognizer, containing references to the scene and camera.
 */
export interface StrokeRecognizerContext {
  camera: THREE.Camera;
  scene: THREE.Scene;
  /** Optional list of shape names that should be supported. */
  supportedShapes?: string[];
}

/**
 * The result of a stroke recognition attempt.
 */
export interface StrokeRecognitionResult {
  /** The name of the recognized shape. */
  recognizedShape: string;
  /** The confidence score of the recognition, typically between 0 and 1. */
  confidence: number;
}

/**
 * Abstract base class for stroke recognition backends.
 */
export abstract class StrokeRecognizerBackend {
  protected context: StrokeRecognizerContext;

  constructor(context: StrokeRecognizerContext) {
    this.context = context;
  }

  /**
   * Recognizes a stroke from a list of 2D points.
   * @param points - The list of points captured during the stroke.
   * @returns The recognition result containing the shape and confidence.
   */
  abstract recognize(points: Point2D[]): StrokeRecognitionResult;
}
