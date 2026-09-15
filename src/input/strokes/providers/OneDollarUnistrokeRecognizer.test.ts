import * as THREE from 'three';
import {describe, expect, it} from 'vitest';

import type {Point2D} from '../StrokeRecognizerBackend';
import {OneDollarUnistrokeRecognizer} from './OneDollarUnistrokeRecognizer';

describe('OneDollarUnistrokeRecognizer', () => {
  it.each<{name: string; points: Point2D[]}>([
    {name: 'empty input', points: []},
    {name: 'a single point at the origin', points: [{x: 0, y: 0}]},
    {name: 'a single point', points: [{x: 4, y: -3}]},
    {
      name: 'two identical points',
      points: Array.from({length: 2}, () => ({x: 4, y: -3})),
    },
    {
      name: '80 identical points',
      points: Array.from({length: 80}, () => ({x: 4, y: -3})),
    },
    {
      name: 'an overflowing path length',
      points: [
        {x: -Number.MAX_VALUE, y: 0},
        {x: Number.MAX_VALUE, y: 0},
      ],
    },
    {
      name: 'an underflowing path length',
      points: [
        {x: 0, y: 0},
        {x: Number.MIN_VALUE, y: 0},
      ],
    },
  ])('returns Unknown with zero confidence for $name', ({points}) => {
    const recognizer = new OneDollarUnistrokeRecognizer({
      camera: new THREE.PerspectiveCamera(),
      scene: new THREE.Scene(),
    });
    const originalPoints = points.map((point) => ({...point}));

    expect(recognizer.recognize(points)).toEqual({
      recognizedShape: 'Unknown',
      confidence: 0,
    });
    expect(points).toEqual(originalPoints);
    expect(
      recognizer.recognize([
        {x: 0, y: 100},
        {x: 50, y: 0},
        {x: 100, y: 100},
      ]).recognizedShape
    ).toBe('V');
  });

  it.each([NaN, Infinity, -Infinity])(
    'returns Unknown with zero confidence for coordinate %s anywhere in a stroke',
    (value) => {
      const recognizer = new OneDollarUnistrokeRecognizer({
        camera: new THREE.PerspectiveCamera(),
        scene: new THREE.Scene(),
      });
      const vPoints = [
        {x: 0, y: 100},
        {x: 50, y: 0},
        {x: 100, y: 100},
      ];

      for (const axis of ['x', 'y'] as const) {
        for (let index = 0; index < vPoints.length; index++) {
          const points = vPoints.map((point, i) =>
            i === index ? {...point, [axis]: value} : {...point}
          );
          const originalPoints = points.map((point) => ({...point}));

          expect(recognizer.recognize(points)).toEqual({
            recognizedShape: 'Unknown',
            confidence: 0,
          });
          expect(points).toEqual(originalPoints);
          expect(recognizer.recognize(vPoints).recognizedShape).toBe('V');
        }
      }
    }
  );

  it('accepts repeated samples within a valid stroke', () => {
    const recognizer = new OneDollarUnistrokeRecognizer({
      camera: new THREE.PerspectiveCamera(),
      scene: new THREE.Scene(),
    });
    const points = [
      {x: 0, y: 100},
      {x: 50, y: 0},
      {x: 100, y: 100},
    ];
    const repeated = points.flatMap((point) =>
      Array.from({length: 4}, () => ({...point}))
    );
    const expected = recognizer.recognize(points);
    const result = recognizer.recognize(repeated);

    expect(result.recognizedShape).toBe('V');
    expect(result.confidence).toBeCloseTo(expected.confidence, 12);
  });

  it('accepts a small positive-length stroke', () => {
    const recognizer = new OneDollarUnistrokeRecognizer({
      camera: new THREE.PerspectiveCamera(),
      scene: new THREE.Scene(),
    });
    const result = recognizer.recognize([
      {x: 0, y: 1e-4},
      {x: 5e-5, y: 0},
      {x: 1e-4, y: 1e-4},
    ]);

    expect(result.recognizedShape).toBe('V');
    expect(result.confidence).toBeGreaterThan(0.9);
  });
});
