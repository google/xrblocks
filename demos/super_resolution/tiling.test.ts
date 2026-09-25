import {describe, expect, it} from 'vitest';

import {
  computeAxisTiles,
  cropSquare,
  detectLayout,
  packTile,
  squareCropRect,
  upscaleImage,
  writeTileOutput,
} from './tiling.js';

function makeImage(width: number, height: number) {
  const data = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      data[i] = (x * 17 + y * 3) % 256;
      data[i + 1] = (x * 5 + y * 19) % 256;
      data[i + 2] = (x * 11 + y * 7) % 256;
      data[i + 3] = 255;
    }
  }
  return {data, width, height};
}

function nearestUpscale(image: ReturnType<typeof makeImage>, scale: number) {
  const out = new Uint8ClampedArray(
    image.width * scale * image.height * scale * 4
  );
  const outWidth = image.width * scale;
  for (let y = 0; y < image.height * scale; y++) {
    for (let x = 0; x < image.width * scale; x++) {
      const src =
        (Math.floor(y / scale) * image.width + Math.floor(x / scale)) * 4;
      const dst = (y * outWidth + x) * 4;
      out[dst] = image.data[src];
      out[dst + 1] = image.data[src + 1];
      out[dst + 2] = image.data[src + 2];
      out[dst + 3] = 255;
    }
  }
  return out;
}

function expectBytesEqual(
  actual: Uint8ClampedArray,
  expected: Uint8ClampedArray
) {
  expect(actual.length).toBe(expected.length);
  for (let i = 0; i < actual.length; i++) {
    if (actual[i] !== expected[i]) {
      expect(actual[i], `byte ${i}`).toBe(expected[i]);
    }
  }
}

function fakeNearestRun(
  layout: 'nchw' | 'nhwc',
  tileSize: number,
  scale: number
) {
  return async (input: Float32Array) => {
    const outSize = tileSize * scale;
    const output = new Float32Array(
      layout === 'nchw' ? 3 * outSize * outSize : outSize * outSize * 3
    );
    for (let y = 0; y < outSize; y++) {
      for (let x = 0; x < outSize; x++) {
        const src =
          (Math.floor(y / scale) * tileSize + Math.floor(x / scale)) * 3;
        const dst = y * outSize + x;
        for (let c = 0; c < 3; c++) {
          if (layout === 'nchw') {
            output[c * outSize * outSize + dst] = input[src + c];
          } else {
            output[dst * 3 + c] = input[src + c];
          }
        }
      }
    }
    return output;
  };
}

describe('computeAxisTiles', () => {
  it('partitions each axis into contiguous core regions', () => {
    const lengths = [1, 64, 127, 128, 129, 200, 256, 511, 1000];
    const tileSize = 128;
    const overlap = 16;

    for (const length of lengths) {
      const tiles = computeAxisTiles(length, tileSize, overlap);
      expect(tiles[0].coreStart).toBe(0);
      expect(tiles.at(-1)?.coreEnd).toBe(length);

      for (let i = 0; i < tiles.length; i++) {
        const tile = tiles[i];
        expect(tile.start).toBeGreaterThanOrEqual(0);
        expect(tile.start).toBeLessThanOrEqual(Math.max(0, length - tileSize));
        expect(tile.coreStart).toBeGreaterThanOrEqual(tile.start);
        expect(tile.coreEnd).toBeLessThanOrEqual(tile.start + tileSize);
        if (i > 0) expect(tile.coreStart).toBe(tiles[i - 1].coreEnd);
        if (i > 0 && i < tiles.length - 1) {
          expect(tile.coreStart - tile.start).toBeGreaterThanOrEqual(
            Math.floor(overlap / 2)
          );
          expect(tile.start + tileSize - tile.coreEnd).toBeGreaterThanOrEqual(
            Math.floor(overlap / 2)
          );
        }
      }
    }
  });

  it('uses three tiles for a 256 px axis with 128 px tiles and 16 px overlap', () => {
    expect(computeAxisTiles(256, 128, 16)).toHaveLength(3);
  });
});

describe('squareCropRect', () => {
  it('defaults to the old centered crop behaviour', () => {
    expect(squareCropRect(5, 3, 10)).toEqual({x0: 1, y0: 0, side: 3});
    expect(squareCropRect(6, 5, 3)).toEqual({x0: 2, y0: 1, side: 3});
  });

  it('clamps to all four edges and corners', () => {
    expect(squareCropRect(100, 80, 20, 0, 0)).toEqual({
      x0: 0,
      y0: 0,
      side: 20,
    });
    expect(squareCropRect(100, 80, 20, 1, 0)).toEqual({
      x0: 80,
      y0: 0,
      side: 20,
    });
    expect(squareCropRect(100, 80, 20, 0, 1)).toEqual({
      x0: 0,
      y0: 60,
      side: 20,
    });
    expect(squareCropRect(100, 80, 20, 1, 1)).toEqual({
      x0: 80,
      y0: 60,
      side: 20,
    });
  });

  it('clamps sizes larger than the image', () => {
    expect(squareCropRect(5, 3, 10, 0.25, 0.75)).toEqual({
      x0: 0,
      y0: 0,
      side: 3,
    });
  });

  it('handles odd sizes and integer rounding', () => {
    expect(squareCropRect(10, 10, 5, 0.5, 0.5)).toEqual({
      x0: 3,
      y0: 3,
      side: 5,
    });
    expect(squareCropRect(11, 9, 5.9, 0.25, 0.75)).toEqual({
      x0: 0,
      y0: 4,
      side: 5,
    });
  });
});

describe('cropSquare', () => {
  it('copies pixels from the requested crop rect', () => {
    const image = makeImage(6, 4);
    const rect = squareCropRect(image.width, image.height, 3, 0.8, 0.75);
    const crop = cropSquare(image, 3, 0.8, 0.75);
    expect(crop.width).toBe(rect.side);
    expect(crop.height).toBe(rect.side);
    for (let y = 0; y < rect.side; y++) {
      for (let x = 0; x < rect.side; x++) {
        const source = ((rect.y0 + y) * image.width + rect.x0 + x) * 4;
        const target = (y * rect.side + x) * 4;
        expect([...crop.data.slice(target, target + 4)]).toEqual([
          ...image.data.slice(source, source + 4),
        ]);
      }
    }
  });
});

describe('packTile', () => {
  it('packs NHWC RGB values normalized to 0-1 with edge clamping', () => {
    const image = makeImage(2, 2);
    const packed = packTile(image, 1, 1, 3);
    expect([...packed.slice(0, 3)]).toEqual([
      expect.closeTo(image.data[12] / 255),
      expect.closeTo(image.data[13] / 255),
      expect.closeTo(image.data[14] / 255),
    ]);
    expect([...packed.slice(3, 6)]).toEqual([...packed.slice(0, 3)]);
    expect([...packed.slice(18, 21)]).toEqual([...packed.slice(0, 3)]);
  });

  it('reuses the provided output buffer', () => {
    const out = new Float32Array(12);
    expect(packTile(makeImage(1, 1), 0, 0, 2, out)).toBe(out);
  });
});

describe('detectLayout', () => {
  it('detects NCHW and NHWC tensor layouts', () => {
    expect(detectLayout([1, 3, 512, 512])).toBe('nchw');
    expect(detectLayout([1, 512, 512, 3])).toBe('nhwc');
  });

  it('throws for unsupported shapes', () => {
    expect(() => detectLayout([1, 4, 512, 512])).toThrow(/layout/i);
    expect(() => detectLayout([512, 512, 3])).toThrow(/layout/i);
  });
});

describe('writeTileOutput', () => {
  it('writes and clamps NCHW output with opaque alpha', () => {
    const target = {
      data: new Uint8ClampedArray(4 * 4 * 4),
      width: 4,
      height: 4,
    };
    const tile = {
      startX: 0,
      startY: 0,
      coreStartX: 0,
      coreEndX: 1,
      coreStartY: 0,
      coreEndY: 1,
    };
    const output = new Float32Array(3 * 4 * 4);
    output[0] = -0.25;
    output[16] = 0.5;
    output[32] = 1.16;
    writeTileOutput(target, tile, output, 'nchw', 4, 1);
    expect([...target.data.slice(0, 4)]).toEqual([0, 128, 255, 255]);
  });

  it('writes NHWC output with opaque alpha', () => {
    const target = {
      data: new Uint8ClampedArray(4 * 4 * 4),
      width: 4,
      height: 4,
    };
    const tile = {
      startX: 0,
      startY: 0,
      coreStartX: 0,
      coreEndX: 1,
      coreStartY: 0,
      coreEndY: 1,
    };
    const output = new Float32Array(4 * 4 * 3);
    output.set([0.25, 0.5, 0.75]);
    writeTileOutput(target, tile, output, 'nhwc', 4, 1);
    expect([...target.data.slice(0, 4)]).toEqual([64, 128, 191, 255]);
  });
});

describe('upscaleImage', () => {
  for (const layout of ['nchw', 'nhwc'] as const) {
    it(`stitches ${layout} tiles without seams or offsets`, async () => {
      for (const [width, height] of [
        [64, 64],
        [128, 128],
        [200, 150],
        [256, 256],
      ] as const) {
        const image = makeImage(width, height);
        let progressCalls = 0;
        const result = await upscaleImage(image, {
          tileSize: 128,
          overlap: 16,
          scale: 4,
          layout,
          runTile: fakeNearestRun(layout, 128, 4),
          onTile(done, total) {
            progressCalls++;
            expect(done).toBeLessThanOrEqual(total);
          },
        });
        expect(result.width).toBe(width * 4);
        expect(result.height).toBe(height * 4);
        expectBytesEqual(result.data, nearestUpscale(image, 4));
        expect(progressCalls).toBe(
          computeAxisTiles(width, 128, 16).length *
            computeAxisTiles(height, 128, 16).length
        );
      }
    }, 60_000);
  }
});
