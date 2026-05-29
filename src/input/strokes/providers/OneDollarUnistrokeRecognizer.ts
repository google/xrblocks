import {
  StrokeRecognizerBackend,
  StrokeRecognizerContext,
  StrokeRecognitionResult,
  Point2D,
} from '../StrokeRecognizerBackend';

export const DEFAULT_SUPPORTED_SHAPES = [
  'Triangle',
  'Rectangle',
  'Circle',
  'V',
  'Caret',
];

/**
 * Represents a shape template used by the $1 Unistroke recognizer.
 */
export interface Template {
  /** The name of the shape. */
  name: string;
  /** The preprocessed points defining the shape. */
  points: Point2D[];
  /** Whether to use rotation invariance when matching this template. */
  useRotation: boolean;
}

/** Calculates the Euclidean distance between two 2D points. */
function distance(p1: Point2D, p2: Point2D): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Calculates the total length of a path defined by a list of points. */
function pathLength(points: Point2D[]): number {
  let d = 0;
  for (let i = 1; i < points.length; i++) {
    d += distance(points[i - 1], points[i]);
  }
  return d;
}

/** Resamples a path into n evenly spaced points. */
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

/** Calculates the centroid (center of mass) of a list of points. */
function getCentroid(points: Point2D[]): Point2D {
  let x = 0,
    y = 0;
  for (let i = 0; i < points.length; i++) {
    x += points[i].x;
    y += points[i].y;
  }
  return {x: x / points.length, y: y / points.length};
}

/** Calculates the bounding box of a list of points. */
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

/** Rotates a list of points by a given angle in radians around their centroid. */
function rotateBy(
  points: Point2D[],
  radians: number,
  centroid: Point2D = getCentroid(points)
): Point2D[] {
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  const newPoints = [];
  for (let i = 0; i < points.length; i++) {
    const qx =
      (points[i].x - centroid.x) * cos -
      (points[i].y - centroid.y) * sin +
      centroid.x;
    const qy =
      (points[i].x - centroid.x) * sin +
      (points[i].y - centroid.y) * cos +
      centroid.y;
    newPoints.push({x: qx, y: qy});
  }
  return newPoints;
}

/** Rotates a list of points so that the angle between the first point and the centroid is zero. */
function rotateToZero(points: Point2D[]): Point2D[] {
  const centroid = getCentroid(points);
  const theta = Math.atan2(points[0].y - centroid.y, points[0].x - centroid.x);
  return rotateBy(points, -theta, centroid);
}

/** Scales a list of points to a standard size (bounding box width/height becomes size). */
function scaleTo(points: Point2D[], size: number): Point2D[] {
  const B = boundingBox(points);
  const newPoints = [];
  const EPSILON = 1e-5;
  const width = Math.max(B.width, EPSILON);
  const height = Math.max(B.height, EPSILON);
  for (let i = 0; i < points.length; i++) {
    const qx = points[i].x * (size / width);
    const qy = points[i].y * (size / height);
    newPoints.push({x: qx, y: qy});
  }
  return newPoints;
}

/** Translates a list of points so that their centroid matches the given point. */
function translateTo(points: Point2D[], pt: Point2D): Point2D[] {
  const centroid = getCentroid(points);
  const newPoints = [];
  for (let i = 0; i < points.length; i++) {
    const qx = points[i].x + pt.x - centroid.x;
    const qy = points[i].y + pt.y - centroid.y;
    newPoints.push({x: qx, y: qy});
  }
  return newPoints;
}

/** Calculates the average distance between corresponding points in two paths. */
function pathDistance(pts1: Point2D[], pts2: Point2D[]): number {
  let d = 0;
  for (let i = 0; i < pts1.length; i++) {
    d += distance(pts1[i], pts2[i]);
  }
  return d / pts1.length;
}

/** Calculates the path distance between a candidate path and a template at a specific angle. */
function distanceAtAngle(
  points: Point2D[],
  template: Template,
  radians: number,
  centroid: Point2D = getCentroid(points)
): number {
  const newPoints = rotateBy(points, radians, centroid);
  return pathDistance(newPoints, template.points);
}

/** Finds the minimum path distance between a candidate path and a template by searching for the best angle using Golden Section Search. */
function distanceAtBestAngle(
  points: Point2D[],
  template: Template,
  a: number,
  b: number,
  threshold: number
): number {
  const phi = 0.5 * (Math.sqrt(5) - 1);
  const centroid = getCentroid(points);
  let x1 = phi * a + (1 - phi) * b;
  let x2 = (1 - phi) * a + phi * b;
  let f1 = distanceAtAngle(points, template, x1, centroid);
  let f2 = distanceAtAngle(points, template, x2, centroid);
  while (Math.abs(b - a) > threshold) {
    if (f1 < f2) {
      b = x2;
      x2 = x1;
      f2 = f1;
      x1 = phi * a + (1 - phi) * b;
      f1 = distanceAtAngle(points, template, x1, centroid);
    } else {
      a = x1;
      x1 = x2;
      f1 = f2;
      x2 = (1 - phi) * a + phi * b;
      f2 = distanceAtAngle(points, template, x2, centroid);
    }
  }
  return Math.min(f1, f2);
}

/**
 * Implementation of the $1 Unistroke recognizer algorithm.
 * It recognizes 2D strokes by comparing them against a set of predefined templates
 * (e.g., Triangle, Rectangle, Circle) after preprocessing them (resampling, rotating, scaling).
 * Supports bi-directional strokes by checking both forward and backward directions.
 * Based on https://depts.washington.edu/acelab/proj/dollar/index.html.
 */
export class OneDollarUnistrokeRecognizer extends StrokeRecognizerBackend {
  templates: Template[] = [];

  constructor(context: StrokeRecognizerContext) {
    super(context);
    const enabledTemplates =
      context.supportedShapes || DEFAULT_SUPPORTED_SHAPES;
    this.populateTemplates(enabledTemplates);
  }

  /**
   * Recognizes a stroke from a list of 2D points by comparing it against stored templates.
   * Supports both forward and backward matching to handle bi-directional strokes.
   * @param points - The list of points captured during the stroke.
   * @returns The recognition result containing the shape name and confidence score.
   */
  override recognize(points: Point2D[]): StrokeRecognitionResult {
    const resampledForward = resample(points, 64);
    const resampledBackward = resampledForward.slice().reverse();

    const pointsForwardUnrotated = this.scaleAndTranslate(resampledForward);
    const pointsBackwardUnrotated = pointsForwardUnrotated.slice().reverse();
    const pointsForwardRotated = this.scaleAndTranslate(
      rotateToZero(resampledForward)
    );
    const pointsBackwardRotated = this.scaleAndTranslate(
      rotateToZero(resampledBackward)
    );

    let bestDistance = Infinity;
    let bestTemplateIndex = -1;

    for (let i = 0; i < this.templates.length; i++) {
      const useRotation = this.templates[i].useRotation;
      const ptsForward = useRotation
        ? pointsForwardRotated
        : pointsForwardUnrotated;
      const ptsBackward = useRotation
        ? pointsBackwardRotated
        : pointsBackwardUnrotated;

      // Find the best matching angle for the stroke drawn in the forward direction.
      // We search within +/- 45 degrees with a step threshold of 2 degrees.
      const forwardDistance = distanceAtBestAngle(
        ptsForward,
        this.templates[i],
        (-45 * Math.PI) / 180,
        (45 * Math.PI) / 180,
        (2 * Math.PI) / 180
      );
      // Find the best matching angle for the stroke drawn in the reverse direction.
      // This allows the user to draw shapes in either direction (e.g. clockwise or counter-clockwise).
      const backwardDistance = distanceAtBestAngle(
        ptsBackward,
        this.templates[i],
        (-45 * Math.PI) / 180,
        (45 * Math.PI) / 180,
        (2 * Math.PI) / 180
      );

      if (forwardDistance < bestDistance) {
        bestDistance = forwardDistance;
        bestTemplateIndex = i;
      }
      if (backwardDistance < bestDistance) {
        bestDistance = backwardDistance;
        bestTemplateIndex = i;
      }
    }
    return bestTemplateIndex !== -1
      ? {
          recognizedShape: this.templates[bestTemplateIndex].name,
          confidence: this.calculateConfidence(bestDistance),
        }
      : {recognizedShape: 'Unknown', confidence: 0};
  }

  /**
   * Populates the templates based on the enabled shapes.
   * @param enabledTemplates - List of shape names to enable.
   */
  private populateTemplates(enabledTemplates: string[]) {
    if (enabledTemplates.includes('Triangle')) {
      // Triangle: Automatically generates 3 variations
      this.addClosedTemplate('Triangle', [
        {x: 0, y: 0},
        {x: 50, y: 100},
        {x: 100, y: 0},
      ]);
    }

    if (enabledTemplates.includes('Rectangle')) {
      // Rectangle: Automatically generates 4 variations
      this.addClosedTemplate('Rectangle', [
        {x: 0, y: 0},
        {x: 0, y: 100},
        {x: 100, y: 100},
        {x: 100, y: 0},
      ]);
    }

    if (enabledTemplates.includes('V')) {
      this.addTemplate(
        'V',
        [
          {x: 0, y: 100},
          {x: 50, y: 0},
          {x: 100, y: 100},
        ],
        false
      );
    }

    if (enabledTemplates.includes('Caret')) {
      this.addTemplate(
        'Caret',
        [
          {x: 0, y: 0},
          {x: 50, y: 100},
          {x: 100, y: 0},
        ],
        false
      );
    }

    if (enabledTemplates.includes('Circle')) {
      // Circle: Add 4 variations for different starting points
      for (let offset = 0; offset < 4; offset++) {
        const circlePoints = [];
        const startAngle = (offset / 4) * Math.PI * 2;
        for (let i = 0; i <= 20; i++) {
          const angle = startAngle + (i / 20) * Math.PI * 2;
          circlePoints.push({
            x: Math.cos(angle) * 100,
            y: Math.sin(angle) * 100,
          });
        }
        this.addTemplate('Circle', circlePoints);
      }
    }
  }

  /**
   * Adds a template for a closed shape by automatically generating cyclic permutations
   * of the points to support different starting points.
   * @param name - The name of the shape.
   * @param points -  The points defining the shape.
   * @param useRotation - Whether to use rotation invariance.
   */
  addClosedTemplate(name: string, points: Point2D[], useRotation = true) {
    const n = points.length;
    for (let i = 0; i < n; i++) {
      const permutedPoints = [];
      for (let j = 0; j <= n; j++) {
        permutedPoints.push(points[(i + j) % n]);
      }
      this.addTemplate(name, permutedPoints, useRotation);
    }
  }

  /**
   * Adds a template to the recognizer.
   * @param name - The name of the shape.
   * @param points - The points defining the shape.
   * @param useRotation - Whether to use rotation invariance.
   */
  addTemplate(name: string, points: Point2D[], useRotation = true) {
    this.templates.push({
      name: name,
      points: this.preprocess(points, useRotation),
      useRotation: useRotation,
    });
  }

  /**
   * Preprocesses a list of points by resampling, optionally rotating to zero,
   * scaling to a standard size, and translating to the origin.
   * @param points - The list of points to preprocess.
   * @param useRotation - Whether to rotate the points to zero.
   * @returns The preprocessed list of points.
   */
  preprocess(points: Point2D[], useRotation = true): Point2D[] {
    points = resample(points, 64);
    if (useRotation) {
      points = rotateToZero(points);
    }
    return this.scaleAndTranslate(points);
  }

  /**
   * Scales points to a standard size and translates them to the origin.
   * @param points - The list of points to scale and translate.
   * @returns The scaled and translated list of points.
   */
  private scaleAndTranslate(points: Point2D[]): Point2D[] {
    return translateTo(scaleTo(points, 250), {x: 0, y: 0});
  }

  /**
   * Calculates the confidence score based on the distance to the best matching template.
   * @param distance - The distance to the best matching template.
   * @returns The confidence score between 0 and 1.
   */
  private calculateConfidence(distance: number): number {
    const size = 250; // Matching the size in preprocess
    const diagonal = Math.sqrt(size * size + size * size);
    const halfDiagonal = 0.5 * diagonal;
    return 1 - distance / halfDiagonal;
  }
}
