import * as THREE from 'three';
import {describe, expect, it} from 'vitest';

import type {Point2D} from '../StrokeRecognizerBackend';
import {OneDollarUnistrokeRecognizer} from './OneDollarUnistrokeRecognizer';

function createRecognizer(supportedShapes?: string[]) {
  return new OneDollarUnistrokeRecognizer({
    camera: new THREE.Camera(),
    scene: new THREE.Scene(),
    supportedShapes,
  });
}

const triangle = [
  {x: -0.8, y: -0.6},
  {x: 0.05, y: 1.1},
  {x: 0.9, y: -0.6},
  {x: -0.8, y: -0.6},
];
const circle = Array.from({length: 81}, (_, i) => {
  const angle = (i / 80) * Math.PI * 2;
  return {x: Math.cos(angle), y: Math.sin(angle)};
});

function transform(points: Point2D[], scale: number, angle: number) {
  return points.map(({x, y}) => ({
    x: scale * (x * Math.cos(angle) - y * Math.sin(angle)) + 17,
    y: scale * (x * Math.sin(angle) + y * Math.cos(angle)) - 29,
  }));
}

describe('OneDollarUnistrokeRecognizer geometry', () => {
  it('resamples by arc length rather than event count, including repeated samples', () => {
    const recognizer = createRecognizer([]);
    const sparse = [
      {x: 0, y: 0},
      {x: 1, y: 0},
      {x: 1, y: 2},
    ];
    const uneven = [
      sparse[0],
      sparse[0],
      {x: 0.02, y: 0},
      {x: 0.03, y: 0},
      sparse[1],
      sparse[1],
      {x: 1, y: 0.01},
      {x: 1, y: 1.99},
      sparse[2],
      sparse[2],
    ];
    // $1's 64 samples divide this length-3 path at s=i/21. The corner
    // is exactly sample 21, so no resampled segment cuts across it.
    // https://depts.washington.edu/acelab/proj/dollar/
    const expected = Array.from({length: 64}, (_, i) => ({
      x: Math.min(i / 21, 1) * 250,
      y: Math.max(i / 21 - 1, 0) * 125,
    }));
    const center = expected.reduce(
      (sum, point) => ({x: sum.x + point.x / 64, y: sum.y + point.y / 64}),
      {x: 0, y: 0}
    );

    for (const points of [sparse, uneven]) {
      const snapshot = structuredClone(points);
      const actual = recognizer.preprocess(points, false);
      expect(actual).toHaveLength(64);
      actual.forEach((point, i) => {
        expect(point.x).toBeCloseTo(expected[i].x - center.x, 10);
        expect(point.y).toBeCloseTo(expected[i].y - center.y, 10);
      });
      expect(points).toEqual(snapshot);
    }
  });

  it.each(['horizontal', 'vertical'] as const)(
    'resamples a two-point %s line without a collapsed-axis division',
    (axis) => {
      const points =
        axis === 'horizontal'
          ? [
              {x: 3, y: 5},
              {x: 7, y: 5},
            ]
          : [
              {x: 3, y: 5},
              {x: 3, y: 9},
            ];
      const actual = createRecognizer([]).preprocess(points, false);
      expect(actual).toHaveLength(64);
      actual.forEach(({x, y}, i) => {
        expect(x).toBeCloseTo(
          axis === 'horizontal' ? -125 + (i * 250) / 63 : 0,
          8
        );
        expect(y).toBeCloseTo(
          axis === 'vertical' ? -125 + (i * 250) / 63 : 0,
          8
        );
      });
    }
  );

  it.each([
    {name: 'Triangle', points: triangle},
    {name: 'Circle', points: circle},
  ])(
    'recognizes $name independently of pose, size and drawing direction',
    ({name, points}) => {
      const recognizer = createRecognizer();
      for (const scale of [0.1, 1, 30]) {
        for (const angle of [0, 0.3, Math.PI / 2, 2.8, Math.PI]) {
          const candidate = transform(points, scale, angle);
          for (const stroke of [candidate, candidate.slice().reverse()]) {
            const snapshot = structuredClone(stroke);
            const result = recognizer.recognize(stroke);
            expect(result.recognizedShape).toBe(name);
            expect(result.confidence).toBeGreaterThan(0.9);
            expect(stroke).toEqual(snapshot);
          }
        }
      }
    }
  );

  it('distinguishes triangle and circle rather than assigning every stroke a high score', () => {
    const triangleOnly = createRecognizer(['Triangle']);
    const circleOnly = createRecognizer(['Circle']);
    expect(triangleOnly.recognize(triangle).confidence).toBeGreaterThan(
      circleOnly.recognize(triangle).confidence + 0.15
    );
    expect(circleOnly.recognize(circle).confidence).toBeGreaterThan(
      triangleOnly.recognize(circle).confidence + 0.15
    );
  });

  it('keeps V and caret distinct while allowing either drawing direction', () => {
    const recognizer = createRecognizer(['V', 'Caret']);
    const caret = [
      {x: -1, y: 0},
      {x: 0, y: 2},
      {x: 1, y: 0},
    ];
    const vee = caret.map(({x, y}) => ({x, y: -y}));
    for (const [name, points] of [
      ['Caret', caret],
      ['V', vee],
    ] as const) {
      for (const stroke of [points, points.slice().reverse()]) {
        const result = recognizer.recognize(stroke);
        expect(result.recognizedShape).toBe(name);
        expect(result.confidence).toBeGreaterThan(0.99);
      }
    }
  });

  it('recognizes an asymmetric custom stroke drawn backwards', () => {
    const recognizer = createRecognizer([]);
    const hook = [
      {x: 0, y: 0},
      {x: 2, y: 0},
      {x: 2, y: 0.4},
      {x: 0.6, y: 0.4},
      {x: 0.6, y: 2},
    ];
    recognizer.addTemplate('Hook', hook, false);

    for (const stroke of [hook, hook.slice().reverse()]) {
      const result = recognizer.recognize(transform(stroke, 3, 0));
      expect(result.recognizedShape).toBe('Hook');
      expect(result.confidence).toBeGreaterThan(0.99);
    }
  });

  it('recognizes closed strokes starting at different corners', () => {
    const recognizer = createRecognizer(['Rectangle']);
    const corners = [
      {x: -2, y: -1},
      {x: 2, y: -1},
      {x: 2, y: 1},
      {x: -2, y: 1},
    ];
    for (let start = 0; start < corners.length; start++) {
      const stroke = Array.from(
        {length: 5},
        (_, i) => corners[(start + i) % corners.length]
      );
      const result = recognizer.recognize(stroke);
      expect(result.recognizedShape).toBe('Rectangle');
      expect(result.confidence).toBeGreaterThan(0.85);
    }
  });

  it('does not invent a supported shape when all templates are disabled', () => {
    expect(createRecognizer([]).recognize(triangle)).toEqual({
      recognizedShape: 'Unknown',
      confidence: 0,
    });
  });
});
