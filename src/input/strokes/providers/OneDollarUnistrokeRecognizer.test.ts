import {execFileSync} from 'node:child_process';
import * as THREE from 'three';
import {describe, expect, it} from 'vitest';

import type {Point2D} from '../StrokeRecognizerBackend';
import {OneDollarUnistrokeRecognizer} from './OneDollarUnistrokeRecognizer';

describe('OneDollarUnistrokeRecognizer', () => {
  it('bounds resampling and rejects insufficient interpolation precision', () => {
    // A separate process makes the timeout effective even for a synchronous loop.
    const output = execFileSync(
      process.execPath,
      [
        '--input-type=module',
        '-e',
        `
          import {createServer} from 'vite';
          import * as THREE from 'three';
          const server = await createServer({
            configFile: false,
            server: {middlewareMode: true},
            optimizeDeps: {noDiscovery: true, include: []},
          });
          try {
            const {OneDollarUnistrokeRecognizer} = await server.ssrLoadModule(
              '/src/input/strokes/providers/OneDollarUnistrokeRecognizer.ts'
            );
            const recognizer = new OneDollarUnistrokeRecognizer({
              camera: new THREE.PerspectiveCamera(),
              scene: new THREE.Scene(),
            });
            const points = [{x: 1, y: 0}, {x: 1 + Number.EPSILON, y: 0}];
            const results = [
              recognizer.recognize(points),
              recognizer.recognize(points.map(({x, y}) => ({x: y, y: x}))),
              // Each interpolated step rounds down to one ULP, exceeding the sample budget.
              recognizer.recognize([
                {x: 1, y: 0},
                {x: 1 + 94 * Number.EPSILON, y: 0},
              ]),
            ];
            const templateCount = recognizer.templates.length;
            let rejectedTemplate = false;
            try {
              recognizer.addTemplate('Unresamplable', points);
            } catch (error) {
              if (!(error instanceof RangeError)) throw error;
              rejectedTemplate = true;
            }
            console.log(JSON.stringify({
              results,
              rejectedTemplate,
              unchangedTemplates: recognizer.templates.length === templateCount,
            }));
          } finally {
            await server.close();
          }
        `,
      ],
      {encoding: 'utf8', timeout: 5000, killSignal: 'SIGKILL'}
    );

    expect(JSON.parse(output)).toEqual({
      results: Array.from({length: 3}, () => ({
        recognizedShape: 'Unknown',
        confidence: 0,
      })),
      rejectedTemplate: true,
      unchangedTemplates: true,
    });
  }, 10000);

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

  it.each([1000, 10000])(
    'accepts a long, dense stroke with %i samples including duplicates',
    (count) => {
      const recognizer = new OneDollarUnistrokeRecognizer({
        camera: new THREE.PerspectiveCamera(),
        scene: new THREE.Scene(),
      });
      const points = Array.from({length: count}, (_, i) => {
        const t = Math.floor(i / 2) / (count / 2 - 1);
        return {x: t * 1e6, y: Math.abs(2 * t - 1) * 1e6};
      });
      const result = recognizer.recognize(points);

      expect(recognizer.preprocess(points)).toHaveLength(64);
      expect(result.recognizedShape).toBe('V');
      expect(result.confidence).toBeGreaterThan(0.9);
    }
  );
});
