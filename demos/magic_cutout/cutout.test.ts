import {describe, expect, it} from 'vitest';

import {
  STYLES,
  computeMaskBounds,
  computeStickerDimensions,
  extractForegroundMask,
  renderCutout,
  renderPreviewOverlay,
} from './cutout.js';

function makeSolidImage(width: number, height: number, rgb = [40, 120, 220]) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const p = i * 4;
    data[p] = rgb[0];
    data[p + 1] = rgb[1];
    data[p + 2] = rgb[2];
    data[p + 3] = 255;
  }
  return {data, width, height};
}

function makeBoxCategoryMask(
  width: number,
  height: number,
  box: {x0: number; y0: number; x1: number; y1: number},
  fgValue = 0,
  bgValue = 255
) {
  const data = new Uint8Array(width * height).fill(bgValue);
  for (let y = box.y0; y <= box.y1; y++) {
    for (let x = box.x0; x <= box.x1; x++) {
      data[y * width + x] = fgValue;
    }
  }
  return {data, width, height};
}

function makeBoxConfidenceMask(
  width: number,
  height: number,
  box: {x0: number; y0: number; x1: number; y1: number},
  fgValue = 0.95,
  bgValue = 0.05
) {
  const data = new Float32Array(width * height).fill(bgValue);
  for (let y = box.y0; y <= box.y1; y++) {
    for (let x = box.x0; x <= box.x1; x++) {
      data[y * width + x] = fgValue;
    }
  }
  return {data, width, height};
}

describe('extractForegroundMask', () => {
  it('reads MediaPipe category masks where < 128 indicates foreground', () => {
    const mask = makeBoxCategoryMask(
      64,
      64,
      {x0: 20, y0: 20, x1: 40, y1: 40},
      0,
      255
    );
    const alpha = extractForegroundMask({categoryMask: mask}, 64, 64, {
      u: 0.47,
      v: 0.47,
    });

    expect(alpha[30 * 64 + 30]).toBeGreaterThan(0.9);
    expect(alpha[0]).toBeLessThan(0.1);
  });

  it('auto-detects inverted confidence masks when corners exceed tap score', () => {
    const inverted = makeBoxConfidenceMask(
      40,
      40,
      {x0: 12, y0: 12, x1: 28, y1: 28},
      0.02,
      0.98
    );
    const alpha = extractForegroundMask({confidenceMasks: [inverted]}, 40, 40, {
      u: 0.5,
      v: 0.5,
    });

    expect(alpha[20 * 40 + 20]).toBeGreaterThan(0.9);
    expect(alpha[0]).toBeLessThan(0.1);
  });

  it('resamples masks when mask dimensions differ from image dimensions', () => {
    const small = makeBoxConfidenceMask(
      32,
      32,
      {x0: 8, y0: 8, x1: 24, y1: 24},
      1.0,
      0.0
    );
    const alpha = extractForegroundMask({confidenceMasks: [small]}, 128, 128, {
      u: 0.5,
      v: 0.5,
    });

    expect(alpha.length).toBe(128 * 128);
    expect(alpha[64 * 128 + 64]).toBeGreaterThan(0.9);
    expect(alpha[2 * 128 + 2]).toBeLessThan(0.1);
  });
});

describe('computeMaskBounds', () => {
  it('computes tight padded bounds and centroid for valid objects', () => {
    const mask = makeBoxConfidenceMask(
      100,
      100,
      {x0: 30, y0: 40, x1: 49, y1: 59},
      1.0,
      0.0
    );
    const alpha = extractForegroundMask({confidenceMasks: [mask]}, 100, 100);
    const result = computeMaskBounds(alpha, 100, 100, 0.35, 4);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.bounds.x0).toBeLessThanOrEqual(27);
    expect(result.bounds.y0).toBeLessThanOrEqual(37);
    expect(result.bounds.width).toBeGreaterThanOrEqual(20);
    expect(result.bounds.centerU).toBeCloseTo(0.395, 1);
    expect(result.bounds.centerV).toBeCloseTo(0.495, 1);
  });

  it('rejects empty masks cleanly', () => {
    const empty = new Float32Array(100 * 100);
    const result = computeMaskBounds(empty, 100, 100);
    expect(result).toMatchObject({ok: false, reason: 'empty'});
  });

  it('rejects full-frame masks cleanly', () => {
    const full = new Float32Array(100 * 100).fill(1);
    const result = computeMaskBounds(full, 100, 100);
    expect(result).toMatchObject({ok: false, reason: 'full_frame'});
  });
});

describe('renderCutout and renderPreviewOverlay', () => {
  it('supports clean, sticker, and glow styles with deterministic borders', () => {
    const image = makeSolidImage(60, 60, [20, 100, 200]);
    const mask = makeBoxConfidenceMask(
      60,
      60,
      {x0: 20, y0: 20, x1: 39, y1: 39},
      1.0,
      0.0
    );
    const alpha = extractForegroundMask({confidenceMasks: [mask]}, 60, 60);
    const boundsResult = computeMaskBounds(alpha, 60, 60, 0.35, 4);
    expect(boundsResult.ok).toBe(true);
    if (!boundsResult.ok) return;

    expect(STYLES).toEqual(['sticker', 'glow', 'clean']);

    const clean = renderCutout(image, alpha, boundsResult.bounds, {
      style: 'clean',
    });
    const sticker = renderCutout(image, alpha, boundsResult.bounds, {
      style: 'sticker',
      borderRadiusPx: 4,
    });
    const glow = renderCutout(image, alpha, boundsResult.bounds, {
      style: 'glow',
      borderRadiusPx: 4,
    });

    expect(sticker.width).toBe(clean.width + 8);
    expect(sticker.height).toBe(clean.height + 8);

    // Center pixel remains the object's original RGB.
    const centerIdx =
      (Math.floor(clean.height / 2) * clean.width +
        Math.floor(clean.width / 2)) *
      4;
    expect(clean.data[centerIdx]).toBe(20);
    expect(clean.data[centerIdx + 3]).toBe(255);

    // Pixel outside the object on clean cutout is fully transparent.
    const cleanEdgeIdx = Math.floor(clean.height / 2) * clean.width * 4;
    expect(clean.data[cleanEdgeIdx + 3]).toBe(0);

    // Exterior border pixel (2 px outside feathered edge) on sticker is opaque
    // white; on glow it is translucent cyan.
    const ringY = Math.floor(sticker.height / 2);
    const ringX = 6;
    const ringIdx = (ringY * sticker.width + ringX) * 4;
    expect(sticker.data[ringIdx]).toBe(248);
    expect(sticker.data[ringIdx + 1]).toBe(250);
    expect(sticker.data[ringIdx + 2]).toBe(252);
    expect(sticker.data[ringIdx + 3]).toBeGreaterThan(200);

    expect(glow.data[ringIdx]).toBe(103);
    expect(glow.data[ringIdx + 1]).toBe(232);
    expect(glow.data[ringIdx + 2]).toBe(249);
    expect(glow.data[ringIdx + 3]).toBeGreaterThan(100);
  });

  it('dims background in preview overlay while preserving foreground brightness', () => {
    const image = makeSolidImage(40, 40, [100, 100, 100]);
    const mask = makeBoxConfidenceMask(
      40,
      40,
      {x0: 15, y0: 15, x1: 25, y1: 25},
      1.0,
      0.0
    );
    const alpha = extractForegroundMask({confidenceMasks: [mask]}, 40, 40);
    const overlay = renderPreviewOverlay(image, alpha, {u: 0.5, v: 0.5});

    // Background corner pixel is dimmed.
    expect(overlay.data[0]).toBe(42);
    // Tap point center pixel is white reticle center.
    const tapIdx = (20 * 40 + 20) * 4;
    expect(overlay.data[tapIdx]).toBe(255);
  });
});

describe('computeStickerDimensions', () => {
  it('preserves aspect ratio and clamps longest dimension to [0.16, 0.85] m', () => {
    const proj = new Array(16).fill(0);
    proj[5] = 1.732;

    const tiny = computeStickerDimensions(20, 10, 640, 480, 0.5, proj);
    expect(Math.max(tiny.widthMeters, tiny.heightMeters)).toBeCloseTo(0.16, 4);
    expect(tiny.widthMeters / tiny.heightMeters).toBeCloseTo(2, 4);

    const huge = computeStickerDimensions(600, 300, 640, 480, 5.0, proj);
    expect(Math.max(huge.widthMeters, huge.heightMeters)).toBeCloseTo(0.85, 4);
    expect(huge.widthMeters / huge.heightMeters).toBeCloseTo(2, 4);
  });
});
