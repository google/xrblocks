import {execFileSync} from 'node:child_process';
import * as THREE from 'three';
import {describe, expect, it} from 'vitest';
import {OneDollarUnistrokeRecognizer} from './OneDollarUnistrokeRecognizer';

function recognizer(supportedShapes?: string[]) {
  return new OneDollarUnistrokeRecognizer({
    camera: new THREE.Camera(),
    scene: new THREE.Scene(),
    supportedShapes,
  });
}
const triangle = [
  {x: -1, y: 0},
  {x: 0, y: 2},
  {x: 1, y: 0},
  {x: -1, y: 0},
];
const circle = Array.from({length: 81}, (_, i) => ({
  x: Math.cos((i / 80) * Math.PI * 2),
  y: Math.sin((i / 80) * Math.PI * 2),
}));

describe('OneDollarUnistrokeRecognizer', () => {
  it.each([
    {name: 'Triangle', points: triangle},
    {name: 'Circle', points: circle},
  ])(
    'recognizes $name after translation, scaling, rotation, and reversal',
    ({name, points}) => {
      const angle = 0.7;
      const stroke = points
        .map(({x, y}) => ({
          x: 3 * (x * Math.cos(angle) - y * Math.sin(angle)) + 17,
          y: 3 * (x * Math.sin(angle) + y * Math.cos(angle)) - 29,
        }))
        .reverse();
      // Repeated input events must not change the recognized shape.
      const result = recognizer().recognize(
        stroke.flatMap((point) => [point, point])
      );
      expect(result.recognizedShape).toBe(name);
      expect(result.confidence).toBeGreaterThan(0.9);
    }
  );

  it('distinguishes shapes and rejects input without a usable path or template', () => {
    const onlyTriangle = recognizer(['Triangle']);
    expect(onlyTriangle.recognize(triangle).confidence).toBeGreaterThan(
      onlyTriangle.recognize(circle).confidence
    );
    const backend = recognizer();
    for (const points of [
      [],
      [
        {x: 1, y: 1},
        {x: 1, y: 1},
      ],
      [
        {x: NaN, y: 0},
        {x: 1, y: 1},
      ],
    ]) {
      expect(backend.recognize(points)).toEqual({
        recognizedShape: 'Unknown',
        confidence: 0,
      });
    }
    expect(recognizer([]).recognize(triangle).recognizedShape).toBe('Unknown');
    expect(backend.recognize(triangle).recognizedShape).toBe('Triangle');
  });

  it('recognizes a registered asymmetric stroke in reverse', () => {
    const backend = recognizer([]);
    const hook = [
      {x: 0, y: 0},
      {x: 2, y: 0},
      {x: 2, y: 0.4},
      {x: 0.6, y: 0.4},
      {x: 0.6, y: 2},
    ];
    backend.addTemplate('Hook', hook, false);
    expect(backend.recognize(hook.slice().reverse()).recognizedShape).toBe(
      'Hook'
    );
  });

  it('rejects numerically collapsed paths without blocking recognition', () => {
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
    });
  }, 10000);
});
