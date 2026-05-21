import * as THREE from 'three';

export interface Point2D {
  x: number;
  y: number;
}

export interface StrokeRecognizerContext {
  camera: THREE.Camera;
  scene: THREE.Scene;
  supportedShapes?: string[];
}

export interface StrokeRecognitionResult {
  recognizedShape: string;
  confidence: number;
}

export interface StrokeRecognizerBackend {
  recognize(points: Point2D[]): StrokeRecognitionResult;
}
