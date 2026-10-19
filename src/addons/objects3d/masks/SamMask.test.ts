import {afterEach, describe, expect, it, vi} from 'vitest';

const litertMocks = vi.hoisted(() => ({
  loadLiteRtRuntime: vi.fn(),
  fetchCachedModel: vi.fn(),
  compileModel: vi.fn(),
  runModel: vi.fn(),
  defaultNumThreads: vi.fn(() => 4),
}));

vi.mock('../../litert', () => litertMocks);

import {
  EFFICIENTSAM_TI_DECODER_URL,
  EFFICIENTSAM_TI_ENCODER_URL,
  SAM_EMBED_DIM,
  SAM_EMBED_GRID,
  SAM_IMG_SIZE,
  SAM_MAX_POINTS,
  buildBboxPrompt,
  decodeMaskLogits,
  getSam,
  resetSamForTesting,
  samEncodeSnapshot,
  samMaskFromBbox,
  snapshotToPlanarFloat32,
} from './SamMask';

afterEach(() => {
  resetSamForTesting();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('snapshotToPlanarFloat32', () => {
  it('converts an exact-size RGBA snapshot into planar RGB in [0, 1]', () => {
    const data = new Uint8ClampedArray([
      255, 0, 0, 255, 0, 255, 0, 255, 0, 0, 255, 255, 255, 255, 255, 255,
    ]);
    const planar = snapshotToPlanarFloat32({data, width: 2, height: 2}, 2);
    expect(planar).toHaveLength(12);
    // R plane: [1, 0, 0, 1]
    expect(Array.from(planar.slice(0, 4))).toEqual([1, 0, 0, 1]);
    // G plane: [0, 1, 0, 1]
    expect(Array.from(planar.slice(4, 8))).toEqual([0, 1, 0, 1]);
    // B plane: [0, 0, 1, 1]
    expect(Array.from(planar.slice(8, 12))).toEqual([0, 0, 1, 1]);
  });

  it('bilinearly resizes a non-square RGBA snapshot to targetSize', () => {
    const data = new Uint8ClampedArray([255, 128, 0, 255, 255, 128, 0, 255]);
    const planar = snapshotToPlanarFloat32({data, width: 2, height: 1}, 4);
    expect(planar).toHaveLength(3 * 16);
    for (let i = 0; i < 16; i++) {
      expect(planar[i]).toBeCloseTo(1.0, 5);
      expect(planar[16 + i]).toBeCloseTo(128 / 255, 5);
      expect(planar[32 + i]).toBeCloseTo(0.0, 5);
    }
  });
});

describe('buildBboxPrompt', () => {
  it('encodes center point (1), top-left (2), bottom-right (3), and padding (-1)', () => {
    const {points, labels} = buildBboxPrompt(
      {min: {x: 0.25, y: 0.5}, max: {x: 0.75, y: 1.0}},
      512,
      6
    );
    expect(Array.from(labels)).toEqual([1, 2, 3, -1, -1, -1]);
    expect(Array.from(points)).toEqual([
      256,
      384, // center
      128,
      256, // top-left
      384,
      512, // bottom-right
      -1,
      -1,
      -1,
      -1,
      -1,
      -1,
    ]);
  });
});

describe('decodeMaskLogits', () => {
  it('selects the candidate with best containment + 0.05 * iou and upsamples', () => {
    const lowRes = 4;
    const stride = lowRes * lowRes;
    const logits = new Float32Array(3 * stride).fill(-5);
    // Candidate 0: covers the whole image (poor containment for a sub-box)
    for (let i = 0; i < stride; i++) logits[i] = 5;
    // Candidate 1: strictly inside the lower-right quadrant [2..4, 2..4]
    for (let y = 2; y < 4; y++) {
      for (let x = 2; x < 4; x++) {
        logits[stride + y * lowRes + x] = 5;
      }
    }
    const ious = new Float32Array([0.9, 0.8, 0.1]);
    const mask = decodeMaskLogits(
      logits,
      ious,
      {min: {x: 0.5, y: 0.5}, max: {x: 1.0, y: 1.0}},
      8,
      8,
      lowRes
    );
    expect(mask.width).toBe(8);
    expect(mask.height).toBe(8);
    const arr = mask.getAsUint8Array();
    // Top-left pixel should be background (255); bottom-right pixel should be foreground (0)
    expect(arr[0]).toBe(255);
    expect(arr[8 * 8 - 1]).toBe(0);
  });
});

describe('getSam / samEncodeSnapshot / samMaskFromBbox', () => {
  it('loads encoder and decoder once and encodes + decodes a snapshot', async () => {
    const fakeEncoder = {name: 'enc'};
    const fakeDecoder = {name: 'dec'};
    litertMocks.loadLiteRtRuntime.mockResolvedValue({accelerator: 'webgpu'});
    litertMocks.fetchCachedModel.mockResolvedValue(new Uint8Array([1, 2]));
    litertMocks.compileModel
      .mockResolvedValueOnce({model: fakeEncoder, accelerator: 'webgpu'})
      .mockResolvedValueOnce({model: fakeDecoder, accelerator: 'webgpu'});

    const models = await getSam();
    expect(models.encoder).toBe(fakeEncoder);
    expect(models.decoder).toBe(fakeDecoder);
    expect(litertMocks.fetchCachedModel).toHaveBeenCalledWith(
      EFFICIENTSAM_TI_ENCODER_URL
    );
    expect(litertMocks.fetchCachedModel).toHaveBeenCalledWith(
      EFFICIENTSAM_TI_DECODER_URL
    );

    const fakeEmb = new Float32Array(
      SAM_EMBED_DIM * SAM_EMBED_GRID * SAM_EMBED_GRID
    );
    const runEnc = vi.fn().mockResolvedValue([fakeEmb]);
    const snapshot = {
      width: 16,
      height: 12,
      data: new Uint8ClampedArray(16 * 12 * 4),
      colorSpace: 'srgb' as PredefinedColorSpace,
    };
    const state = await samEncodeSnapshot(snapshot, runEnc);
    expect(state.width).toBe(16);
    expect(state.height).toBe(12);
    expect(runEnc).toHaveBeenCalledExactlyOnceWith(fakeEncoder, [
      {
        data: expect.any(Float32Array),
        shape: [1, 3, SAM_IMG_SIZE, SAM_IMG_SIZE],
      },
    ]);

    const fakeLogits = new Float32Array(3 * 128 * 128).fill(2);
    const fakeIous = new Float32Array([0.5, 0.9, 0.3]);
    const runDec = vi.fn().mockResolvedValue([fakeLogits, fakeIous]);
    const mask = await samMaskFromBbox(
      state,
      {min: {x: 0.1, y: 0.1}, max: {x: 0.9, y: 0.9}},
      runDec
    );
    expect(runDec).toHaveBeenCalledExactlyOnceWith(fakeDecoder, [
      {
        data: state.imageEmbeddings,
        shape: [1, SAM_EMBED_DIM, SAM_EMBED_GRID, SAM_EMBED_GRID],
      },
      {
        data: expect.any(Float32Array),
        shape: [1, SAM_MAX_POINTS, 2],
      },
      {
        data: expect.any(Float32Array),
        shape: [1, SAM_MAX_POINTS],
      },
    ]);
    expect(mask.width).toBe(16);
    expect(mask.height).toBe(12);
    expect(mask.getAsUint8Array()[0]).toBe(0);
  });

  it('clears cached promise on failure so subsequent getSam() retries', async () => {
    litertMocks.loadLiteRtRuntime
      .mockRejectedValueOnce(new Error('network error'))
      .mockResolvedValueOnce({accelerator: 'wasm'});
    litertMocks.fetchCachedModel.mockResolvedValue(new Uint8Array([1]));
    litertMocks.compileModel.mockResolvedValue({
      model: {},
      accelerator: 'wasm',
    });

    await expect(getSam()).rejects.toThrow('network error');
    const models = await getSam();
    expect(models.encoderAccelerator).toBe('wasm');
  });
});
