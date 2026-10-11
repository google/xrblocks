// @vitest-environment node
import {describe, expect, it} from 'vitest';
import {MAX_IMAGE_EDGE, fitSnapshotSize, packSnapshot} from './image.js';

describe('fitSnapshotSize', () => {
  it('uses a 768-pixel default edge', () => {
    expect(MAX_IMAGE_EDGE).toBe(768);
  });

  it.each([
    [1920, 1080, 768, 432],
    [1080, 1920, 432, 768],
    [1024, 1024, 768, 768],
    [768, 768, 768, 768],
    [320, 240, 320, 240],
    [1, 1, 1, 1],
    [1000000, 1, 768, 1],
    [1, 1000000, 1, 768],
    [1001, 333, 768, 255],
  ])('fits %ix%i without upscaling', (width, height, outWidth, outHeight) => {
    expect(fitSnapshotSize(width, height)).toEqual({
      width: outWidth,
      height: outHeight,
    });
  });

  it('supports an explicit smaller edge', () => {
    expect(fitSnapshotSize(1920, 1080, 384)).toEqual({
      width: 384,
      height: 216,
    });
    expect(fitSnapshotSize(64, 32, 384)).toEqual({width: 64, height: 32});
  });

  it.each([0, -1, NaN, Infinity, -Infinity, 1.5, '2', null, undefined])(
    'rejects malformed dimensions and edge %s',
    (value) => {
      expect(() => fitSnapshotSize(value, 100)).toThrow();
      expect(() => fitSnapshotSize(100, value)).toThrow();
      if (value !== undefined) {
        expect(() => fitSnapshotSize(100, 100, value)).toThrow();
      }
    }
  );
});

describe('packSnapshot', () => {
  it('packs bounded RGBA pixels into an ArrayBuffer', () => {
    const data = new Uint8ClampedArray(MAX_IMAGE_EDGE * 4);
    const packed = packSnapshot({width: MAX_IMAGE_EDGE, height: 1, data});
    expect(packed.width).toBe(MAX_IMAGE_EDGE);
    expect(packed.height).toBe(1);
    expect(packed.buffer).toBeInstanceOf(ArrayBuffer);
    expect(new Uint8Array(packed.buffer)).toEqual(new Uint8Array(data));
  });

  it.each([Uint8Array, Uint8ClampedArray])(
    'copies only the selected %s subview without surrounding bytes',
    (ArrayType) => {
      const storage = new ArrayType([99, 98, 1, 2, 3, 4, 97, 96]);
      const data = storage.subarray(2, 6);
      const packed = packSnapshot({width: 1, height: 1, data});
      expect(packed.buffer.byteLength).toBe(4);
      expect([...new Uint8Array(packed.buffer)]).toEqual([1, 2, 3, 4]);
      expect(packed.buffer).not.toBe(storage.buffer);
      storage[2] = 42;
      expect(new Uint8Array(packed.buffer)[0]).toBe(1);
      new Uint8Array(packed.buffer)[1] = 55;
      expect(storage[3]).toBe(2);
    }
  );

  it('keeps thumbnail pixels owned by the caller after transferring', () => {
    const data = new Uint8ClampedArray([1, 2, 3, 255]);
    const packed = packSnapshot({width: 1, height: 1, data});
    const received = structuredClone(packed, {transfer: [packed.buffer]});
    expect(packed.buffer.byteLength).toBe(0);
    expect([...new Uint8Array(received.buffer)]).toEqual([1, 2, 3, 255]);
    expect([...data]).toEqual([1, 2, 3, 255]);
    expect(data.buffer.byteLength).toBe(4);
  });

  it.each([0, -1, NaN, Infinity, 1.5, 769, '1', null, undefined])(
    'rejects invalid or oversized dimensions %s',
    (value) => {
      const data = new Uint8ClampedArray(4);
      expect(() => packSnapshot({width: value, height: 1, data})).toThrow();
      expect(() => packSnapshot({width: 1, height: value, data})).toThrow();
    }
  );

  it.each([0, 3, 5, 8])('rejects incorrect RGBA length %i', (length) => {
    expect(() =>
      packSnapshot({width: 1, height: 1, data: new Uint8ClampedArray(length)})
    ).toThrow(/RGBA/);
  });

  it.each([
    null,
    undefined,
    [1, 2, 3, 4],
    new Uint16Array(4),
    new Float32Array(4),
    new DataView(new ArrayBuffer(4)),
  ])('rejects non-byte pixel storage %s', (data) => {
    expect(() => packSnapshot({width: 1, height: 1, data})).toThrow(/RGBA/);
  });
});
