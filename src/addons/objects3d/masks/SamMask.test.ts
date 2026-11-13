import {afterEach, expect, it, vi} from 'vitest';
const native = vi.hoisted(() => {
  class Tensor {
    constructor(
      readonly values: Float32Array,
      readonly shape?: number[]
    ) {}
    static fromTypedArray(values: Float32Array, shape: number[]) {
      return new Tensor(values, shape);
    }
    async data() {
      return this.values;
    }
    delete() {}
  }
  return {Tensor, compile: vi.fn(), load: vi.fn(async () => ({}))};
});
vi.mock('@litertjs/core', () => ({
  Tensor: native.Tensor,
  loadAndCompile: native.compile,
  loadLiteRt: native.load,
  getGlobalLiteRtPromise: () => undefined,
  isWebGPUSupported: () => false,
}));
import {resetLiteRtRuntimeForTesting} from '../../litert/LiteRtRuntime';
import {
  getSam,
  resetSamForTesting,
  samEncodeSnapshot,
  samMaskFromBbox,
  snapshotToPlanarFloat32,
} from './SamMask';
afterEach(() => {
  resetSamForTesting();
  resetLiteRtRuntimeForTesting();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  native.compile.mockReset();
});

it('maps image RGB channels to normalized planar input', () => {
  const rgba = new Uint8ClampedArray([255, 0, 0, 255, 0, 255, 128, 255]);
  const planar = snapshotToPlanarFloat32({data: rgba, width: 2, height: 1}, 2);
  expect(Array.from(planar)).toEqual([
    1,
    0,
    1,
    0,
    0,
    1,
    0,
    1,
    0,
    expect.closeTo(128 / 255),
    0,
    expect.closeTo(128 / 255),
  ]);
});

it('retries failed model loading and produces a mask at the supplied image dimensions', async () => {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(new Uint8Array([1, 2])))
  );
  vi.stubGlobal('caches', undefined);
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  native.compile.mockRejectedValueOnce(new Error('offline'));
  await expect(getSam()).rejects.toThrow('offline');
  const embedding = new Float32Array(256 * 32 * 32);
  native.compile
    .mockResolvedValueOnce({
      run: async (inputs: InstanceType<typeof native.Tensor>[]) => {
        expect(inputs[0].shape).toEqual([1, 3, 512, 512]);
        return [new native.Tensor(embedding)];
      },
    })
    .mockResolvedValueOnce({
      run: async (inputs: InstanceType<typeof native.Tensor>[]) => {
        expect(inputs[1].shape).toEqual([1, 6, 2]);
        expect(Array.from(inputs[2].values).slice(0, 3)).toEqual([1, 2, 3]);
        const logits = new Float32Array(128 * 128).fill(-1);
        for (let y = 0; y < 128; y++) logits.fill(1, y * 128, y * 128 + 64);
        return [
          new native.Tensor(logits),
          new native.Tensor(new Float32Array([1])),
        ];
      },
    });
  const image = {
    width: 4,
    height: 2,
    data: new Uint8ClampedArray(32),
    colorSpace: 'srgb',
  } as ImageData;
  const state = await samEncodeSnapshot(image);
  const mask = await samMaskFromBbox(state, {
    min: {x: 0, y: 0},
    max: {x: 1, y: 1},
  });
  expect([mask.width, mask.height]).toEqual([4, 2]);
  expect(Array.from(mask.getAsUint8Array())).toEqual([
    0, 0, 255, 255, 0, 0, 255, 255,
  ]);
});
