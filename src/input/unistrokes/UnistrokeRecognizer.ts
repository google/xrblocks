import * as THREE from 'three';
import {GestureRecognition} from '../gestures/GestureRecognition';
import {User} from '../../core/User';
import {Script} from '../../core/Script';

// --- Dollar $1 Recognizer Implementation ---

interface Point2D {
  x: number;
  y: number;
}

interface Template {
  name: string;
  points: Point2D[];
  useRotation: boolean;
}

function distance(p1: Point2D, p2: Point2D): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

function pathLength(points: Point2D[]): number {
  let d = 0;
  for (let i = 1; i < points.length; i++) {
    d += distance(points[i - 1], points[i]);
  }
  return d;
}

function resample(points: Point2D[], n: number): Point2D[] {
  const interval = pathLength(points) / (n - 1);
  let D = 0;
  const newPoints = [points[0]];
  const pts = points.slice();
  let i = 1;
  while (i < pts.length) {
    const pt1 = pts[i - 1];
    const pt2 = pts[i];
    const d = distance(pt1, pt2);
    if (D + d >= interval) {
      const t = (interval - D) / d;
      const q = {
        x: pt1.x + t * (pt2.x - pt1.x),
        y: pt1.y + t * (pt2.y - pt1.y),
      };
      newPoints.push(q);
      pts.splice(i, 0, q);
      D = 0;
    } else {
      D += d;
    }
    i++;
  }
  if (newPoints.length === n - 1) {
    newPoints.push(pts[pts.length - 1]);
  }
  return newPoints;
}

function centroid(points: Point2D[]): Point2D {
  let x = 0,
    y = 0;
  for (let i = 0; i < points.length; i++) {
    x += points[i].x;
    y += points[i].y;
  }
  return {x: x / points.length, y: y / points.length};
}

function boundingBox(points: Point2D[]) {
  let minX = Infinity,
    maxX = -Infinity,
    minY = Infinity,
    maxY = -Infinity;
  for (let i = 0; i < points.length; i++) {
    minX = Math.min(minX, points[i].x);
    maxX = Math.max(maxX, points[i].x);
    minY = Math.min(minY, points[i].y);
    maxY = Math.max(maxY, points[i].y);
  }
  return {x: minX, y: minY, width: maxX - minX, height: maxY - minY};
}

function rotateBy(points: Point2D[], radians: number): Point2D[] {
  const c = centroid(points);
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const newPoints = [];
  for (let i = 0; i < points.length; i++) {
    const qx = (points[i].x - c.x) * cos - (points[i].y - c.y) * sin + c.x;
    const qy = (points[i].x - c.x) * sin + (points[i].y - c.y) * cos + c.y;
    newPoints.push({x: qx, y: qy});
  }
  return newPoints;
}

function rotateToZero(points: Point2D[]): Point2D[] {
  const c = centroid(points);
  const theta = Math.atan2(points[0].y - c.y, points[0].x - c.x);
  return rotateBy(points, -theta);
}

function scaleTo(points: Point2D[], size: number): Point2D[] {
  const B = boundingBox(points);
  const newPoints = [];
  for (let i = 0; i < points.length; i++) {
    const qx = points[i].x * (size / B.width);
    const qy = points[i].y * (size / B.height);
    newPoints.push({x: qx, y: qy});
  }
  return newPoints;
}

function translateTo(points: Point2D[], pt: Point2D): Point2D[] {
  const c = centroid(points);
  const newPoints = [];
  for (let i = 0; i < points.length; i++) {
    const qx = points[i].x + pt.x - c.x;
    const qy = points[i].y + pt.y - c.y;
    newPoints.push({x: qx, y: qy});
  }
  return newPoints;
}

function pathDistance(pts1: Point2D[], pts2: Point2D[]): number {
  let d = 0;
  for (let i = 0; i < pts1.length; i++) {
    d += distance(pts1[i], pts2[i]);
  }
  return d / pts1.length;
}

function distanceAtAngle(
  points: Point2D[],
  template: Template,
  radians: number
): number {
  const newPoints = rotateBy(points, radians);
  return pathDistance(newPoints, template.points);
}

function distanceAtBestAngle(
  points: Point2D[],
  template: Template,
  a: number,
  b: number,
  threshold: number
): number {
  const phi = 0.5 * (Math.sqrt(5) - 1);
  let x1 = phi * a + (1 - phi) * b;
  let x2 = (1 - phi) * a + phi * b;
  let f1 = distanceAtAngle(points, template, x1);
  let f2 = distanceAtAngle(points, template, x2);
  while (Math.abs(b - a) > threshold) {
    if (f1 < f2) {
      b = x2;
      x2 = x1;
      f2 = f1;
      x1 = phi * a + (1 - phi) * b;
      f1 = distanceAtAngle(points, template, x1);
    } else {
      a = x1;
      x1 = x2;
      f1 = f2;
      x2 = (1 - phi) * a + phi * b;
      f2 = distanceAtAngle(points, template, x2);
    }
  }
  return Math.min(f1, f2);
}

class DollarRecognizer {
  templates: Template[] = [];

  constructor() {
    // Triangle: Add 3 variations for different starting corners
    this.addTemplate('Triangle', [
      {x: 0, y: 0},
      {x: 50, y: 100},
      {x: 100, y: 0},
      {x: 0, y: 0},
    ]);
    this.addTemplate('Triangle', [
      {x: 50, y: 100},
      {x: 100, y: 0},
      {x: 0, y: 0},
      {x: 50, y: 100},
    ]);
    this.addTemplate('Triangle', [
      {x: 100, y: 0},
      {x: 0, y: 0},
      {x: 50, y: 100},
      {x: 100, y: 0},
    ]);

    // Rectangle: Add 4 variations for different starting corners
    this.addTemplate('Rectangle', [
      {x: 0, y: 0},
      {x: 0, y: 100},
      {x: 100, y: 100},
      {x: 100, y: 0},
      {x: 0, y: 0},
    ]);
    this.addTemplate('Rectangle', [
      {x: 0, y: 100},
      {x: 100, y: 100},
      {x: 100, y: 0},
      {x: 0, y: 0},
      {x: 0, y: 100},
    ]);
    this.addTemplate('Rectangle', [
      {x: 100, y: 100},
      {x: 100, y: 0},
      {x: 0, y: 0},
      {x: 0, y: 100},
      {x: 100, y: 100},
    ]);
    this.addTemplate('Rectangle', [
      {x: 100, y: 0},
      {x: 0, y: 0},
      {x: 0, y: 100},
      {x: 100, y: 100},
      {x: 100, y: 0},
    ]);

    this.addTemplate(
      'V',
      [
        {x: 0, y: 100},
        {x: 50, y: 0},
        {x: 100, y: 100},
      ],
      false
    );
    this.addTemplate(
      'Caret',
      [
        {x: 0, y: 0},
        {x: 50, y: 100},
        {x: 100, y: 0},
      ],
      false
    );

    // Circle: Add 4 variations for different starting points
    for (let offset = 0; offset < 4; offset++) {
      const circlePoints = [];
      const startAngle = (offset / 4) * Math.PI * 2;
      for (let i = 0; i <= 20; i++) {
        const angle = startAngle + (i / 20) * Math.PI * 2;
        circlePoints.push({x: Math.cos(angle) * 100, y: Math.sin(angle) * 100});
      }
      this.addTemplate('Circle', circlePoints);
    }
  }

  addTemplate(name: string, points: Point2D[], useRotation = true) {
    this.templates.push({
      name: name,
      points: this.preprocess(points, useRotation),
      useRotation: useRotation,
    });
  }

  preprocess(points: Point2D[], useRotation = true): Point2D[] {
    points = resample(points, 64);
    if (useRotation) {
      points = rotateToZero(points);
    }
    points = scaleTo(points, 250);
    points = translateTo(points, {x: 0, y: 0});
    return points;
  }

  recognize(points: Point2D[]) {
    const pointsForwardRotated = this.preprocess(points, true);
    const pointsBackwardRotated = this.preprocess(
      points.slice().reverse(),
      true
    );
    const pointsForwardUnrotated = this.preprocess(points, false);
    const pointsBackwardUnrotated = this.preprocess(
      points.slice().reverse(),
      false
    );

    let b = Infinity;
    let u = -1;

    for (let i = 0; i < this.templates.length; i++) {
      const useRotation = this.templates[i].useRotation;
      const ptsForward = useRotation
        ? pointsForwardRotated
        : pointsForwardUnrotated;
      const ptsBackward = useRotation
        ? pointsBackwardRotated
        : pointsBackwardUnrotated;

      const dForward = distanceAtBestAngle(
        ptsForward,
        this.templates[i],
        (-45 * Math.PI) / 180,
        (45 * Math.PI) / 180,
        (2 * Math.PI) / 180
      );
      const dBackward = distanceAtBestAngle(
        ptsBackward,
        this.templates[i],
        (-45 * Math.PI) / 180,
        (45 * Math.PI) / 180,
        (2 * Math.PI) / 180
      );

      if (dForward < b) {
        b = dForward;
        u = i;
      }
      if (dBackward < b) {
        b = dBackward;
        u = i;
      }
    }
    return u !== -1
      ? {
          name: this.templates[u].name,
          score: 1 - b / (0.5 * Math.sqrt(250 * 250 + 250 * 250)),
        }
      : {name: 'Unknown', score: 0};
  }
}

export interface UnistrokeEventMap extends THREE.Object3DEventMap {
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

export class UnistrokeRecognizer extends Script<UnistrokeEventMap> {
  static dependencies = {
    scene: THREE.Scene,
    camera: THREE.Camera,
    gestureRecognition: GestureRecognition,
    user: User,
  };

  private recognizer = new DollarRecognizer();
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
