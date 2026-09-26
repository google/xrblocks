import * as THREE from 'three';
import {describe, expect, it, vi} from 'vitest';

import {
  MOGE_SIZE,
  buildCloud,
  disposeCloud,
  inferMoge,
  resolveOutputs,
} from './moge.js';

const PLANE = MOGE_SIZE * MOGE_SIZE;

// Unit normals (|n| = 1) and a point map whose coordinates are scale-free.
function fullMaps(pointValue = 3, normalValue = 1 / Math.sqrt(3)) {
  const points = new Float32Array(PLANE * 3).fill(pointValue);
  const normal = new Float32Array(PLANE * 3).fill(normalValue);
  const mask = new Float32Array(PLANE).fill(1);
  const scale = new Float32Array([1.25]);
  return {points, normal, mask, scale};
}

describe('resolveOutputs', () => {
  it('finds the point map by its range regardless of output order', () => {
    const {points, normal, mask, scale} = fullMaps();
    const forward = resolveOutputs([points, normal, mask, scale]);
    expect(forward.points).toBe(points);
    expect(forward.mask).toBe(mask);
    expect(forward.scale).toBe(1.25);

    const shuffled = resolveOutputs([scale, normal, mask, points]);
    expect(shuffled.points).toBe(points);
  });

  it('tells points from unit normals even when the points are smaller', () => {
    // A close-range scene: affine coordinates well inside the normals' ±1.
    const {points, normal, mask, scale} = fullMaps(0.3);
    expect(resolveOutputs([normal, points, mask, scale]).points).toBe(points);
    expect(resolveOutputs([points, normal, mask, scale]).points).toBe(points);
    // Normals with only an x component, the case a fixed float stride sees.
    const axisNormal = new Float32Array(PLANE * 3);
    for (let p = 0; p < PLANE; p++) axisNormal[p * 3] = p % 2 ? 1 : -1;
    expect(resolveOutputs([axisNormal, points, mask, scale]).points).toBe(
      points
    );
  });

  it('throws when the outputs do not look like MoGe', () => {
    const {points, mask} = fullMaps();
    expect(() => resolveOutputs([points, mask])).toThrow(
      'unexpected model outputs'
    );
  });
});

describe('inferMoge', () => {
  it('runs the model with the NCHW shape and reports latency', async () => {
    const {points, normal, mask, scale} = fullMaps();
    const runModel = vi.fn().mockResolvedValue([points, normal, mask, scale]);
    const nchw = new Float32Array(3 * PLANE);
    const model = {};

    const result = await inferMoge(model, nchw, runModel);

    expect(runModel).toHaveBeenCalledWith(model, [
      {data: nchw, shape: [1, 3, MOGE_SIZE, MOGE_SIZE]},
    ]);
    expect(result.points).toBe(points);
    expect(result.elapsed).toBeGreaterThanOrEqual(0);
  });
});

describe('buildCloud', () => {
  /**
   * A synthetic point map: a flat wall at depth 2 that is `w` pixels wide and
   * `h` pixels tall (in MoGe camera units), with the photo filling the whole
   * input (no letterbox padding).
   */
  function wall({w = 2, h = 1, depth = 2} = {}) {
    const points = new Float32Array(PLANE * 3);
    const rgba = new Uint8ClampedArray(PLANE * 4);
    const mask = new Float32Array(PLANE).fill(1);
    const valid = new Uint8Array(PLANE).fill(1);
    for (let i = 0; i < PLANE; i++) {
      const px = i % MOGE_SIZE;
      const py = (i / MOGE_SIZE) | 0;
      points[i * 3] = (px / (MOGE_SIZE - 1) - 0.5) * w;
      points[i * 3 + 1] = (py / (MOGE_SIZE - 1) - 0.5) * h;
      points[i * 3 + 2] = depth;
      rgba[i * 4] = 255;
      rgba[i * 4 + 3] = 255;
    }
    return {points, rgba, mask, valid};
  }

  it('normalizes the larger extent to targetSize and flips to three.js axes', () => {
    const {points, rgba, mask, valid} = wall({w: 2, h: 1});
    const cloud = buildCloud(points, mask, rgba, valid, {targetSize: 0.5});

    expect(cloud).toBeInstanceOf(THREE.Points);
    const box = cloud.geometry.boundingBox!;
    const size = box.getSize(new THREE.Vector3());
    expect(size.x).toBeCloseTo(0.5, 1);
    expect(size.y).toBeCloseTo(0.25, 1);
    // The wall sits in front of the capture camera: negative z.
    expect(box.max.z).toBeLessThan(0);
    const color = cloud.geometry.getAttribute('color');
    expect(color.getX(0)).toBe(1);
    expect(color.getY(0)).toBe(0);
    expect(cloud.userData.count).toBe(color.count);
    expect(cloud.material.size).toBeCloseTo(2.5 * (0.5 / MOGE_SIZE));
  });

  it('drops masked, padded, rim and non-finite pixels', () => {
    const {points, rgba, mask, valid} = wall();
    const full = buildCloud(points, mask, rgba, valid).userData.count;

    // Mask out the left half; pad the bottom quarter; poison one pixel.
    for (let i = 0; i < PLANE; i++) {
      if (i % MOGE_SIZE < MOGE_SIZE / 2) mask[i] = 0;
      if (i >= (PLANE * 3) / 4) valid[i] = 0;
    }
    points[(MOGE_SIZE * 100 + 300) * 3] = NaN;
    const trimmed = buildCloud(points, mask, rgba, valid).userData.count;

    expect(trimmed).toBeLessThan(full * 0.4);
    expect(trimmed).toBeGreaterThan(0);
  });

  it('does not take part in raycasts and throws when nothing is confident', () => {
    const {points, rgba, mask, valid} = wall();
    const cloud = buildCloud(points, mask, rgba, valid);
    const hits: THREE.Intersection[] = [];
    cloud.raycast(new THREE.Raycaster(), hits);
    expect(hits).toHaveLength(0);

    mask.fill(0);
    expect(() => buildCloud(points, mask, rgba, valid)).toThrow(
      'no confident points'
    );
  });

  it('trims the far background tail relative to the median depth', () => {
    const {points, rgba, mask, valid} = wall();
    // Push the top 10% of rows far away (a sky shell).
    for (let i = 0; i < PLANE * 0.1; i++) points[i * 3 + 2] = 50;
    const cloud = buildCloud(points, mask, rgba, valid, {targetSize: 1});
    const box = cloud.geometry.boundingBox!;
    const depth = box.max.z - box.min.z;
    // A flat wall: near-zero depth once the shell is gone (fit ≈ 0.5/unit).
    expect(depth).toBeLessThan(0.01);
    expect(cloud.userData.medianDepth).toBeCloseTo(2);
  });

  it('disposeCloud releases geometry and material', () => {
    const {points, rgba, mask, valid} = wall();
    const cloud = buildCloud(points, mask, rgba, valid);
    const geometry = vi.spyOn(cloud.geometry, 'dispose');
    const material = vi.spyOn(cloud.material, 'dispose');
    disposeCloud(cloud);
    disposeCloud(null);
    expect(geometry).toHaveBeenCalled();
    expect(material).toHaveBeenCalled();
  });
});
