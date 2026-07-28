import type * as THREE from 'three';

import type {HeadGestureRecognition} from './HeadGestureRecognition';

export type HeadGestureEventDetail = {
  name: string;
  confidence: number;
  data?: Record<string, unknown>;
};

export type HeadGestureEvent = THREE.Event & {
  type: 'gesture';
  target: HeadGestureRecognition;
  detail: HeadGestureEventDetail;
};

export interface HeadGestureEventMap extends THREE.Object3DEventMap {
  gesture: HeadGestureEvent;
}
