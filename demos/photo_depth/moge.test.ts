import {describe, expect, it, vi} from 'vitest';

import {MOGE_SIZE, inferMoge, letterboxParams, resolveOutputs} from './moge.js';

const PLANE = MOGE_SIZE * MOGE_SIZE;

function outputs() {
  const points = new Float32Array(PLANE * 3).fill(0.3); // close range, < 1
  const normals = new Float32Array(PLANE * 3).fill(1 / Math.sqrt(3));
  const mask = new Float32Array(PLANE).fill(1);
  const scale = new Float32Array([1.25]);
  return {points, normals, mask, scale};
}

describe('resolveOutputs', () => {
  it('returns points and normals regardless of output order', () => {
    const {points, normals, mask, scale} = outputs();
    for (const order of [
      [points, normals, mask, scale],
      [scale, normals, mask, points],
    ]) {
      const resolved = resolveOutputs(order);
      expect(resolved.points).toBe(points);
      expect(resolved.normals).toBe(normals);
      expect(resolved.mask).toBe(mask);
      expect(resolved.scale).toBe(1.25);
    }
  });

  it('rejects unexpected outputs', () => {
    const {points, mask, scale} = outputs();
    expect(() => resolveOutputs([points, mask, scale])).toThrow(
      'unexpected model outputs'
    );
  });
});

describe('inferMoge', () => {
  it('runs the model on the NCHW input and resolves the outputs', async () => {
    const {points, normals, mask, scale} = outputs();
    const runModel = vi.fn().mockResolvedValue([normals, scale, points, mask]);
    const nchw = new Float32Array(3 * PLANE);
    const model = {};
    const result = await inferMoge(model, nchw, runModel);
    expect(runModel).toHaveBeenCalledWith(model, [
      {data: nchw, shape: [1, 3, MOGE_SIZE, MOGE_SIZE]},
    ]);
    expect(result.points).toBe(points);
    expect(result.normals).toBe(normals);
    expect(result.elapsed).toBeGreaterThanOrEqual(0);
  });
});

describe('letterboxParams', () => {
  it('reports exact per-axis scales after rounding', () => {
    const lb = letterboxParams(1000, 333);
    expect(lb.drawW).toBe(448);
    expect(lb.drawH).toBe(Math.round(333 * (448 / 1000)));
    expect(lb.scaleY).toBeCloseTo(lb.drawH / 333, 12);
    expect(lb.offY).toBe(Math.floor((448 - lb.drawH) / 2));
  });
});
