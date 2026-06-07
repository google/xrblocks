export type GestureEventType = 'gesturestart' | 'gestureupdate' | 'gestureend';

export type GestureHandedness = 'left' | 'right';

export interface GestureEventDetail {
  /**
   * The canonical gesture identifier from the configured gesture recognizer.
   */
  name: string;
  /** Which hand triggered the gesture. */
  hand: GestureHandedness;
  /** Gesture recognizer confidence score, normalized to [0, 1]. */
  confidence: number;
  /**
   * Optional payload for recognizer specific values (e.g. pinch distance,
   * velocity vectors).
   */
  data?: Record<string, unknown>;
}

export interface GestureEvent {
  type: GestureEventType;
  detail: GestureEventDetail;
}
