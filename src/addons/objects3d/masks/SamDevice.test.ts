import {describe, it, expect} from 'vitest';

import {
  SAM_ATTENTION_ELEMENTS,
  samDeviceCandidates,
  type SamGpuAdapterInfo,
} from './SamDevice';

/** WebGPU spec default, and the limit Galaxy XR / many mobile GPUs report. */
const SPEC_DEFAULT_BINDING = 134217728;

function makeAdapter(
  maxStorageBufferBindingSize: number | undefined,
  features: string[] = ['shader-f16']
): SamGpuAdapterInfo {
  return {
    features: {has: (f: string) => features.includes(f)},
    limits: {maxStorageBufferBindingSize},
  };
}

describe('samDeviceCandidates', () => {
  it('uses cpu only when there is no adapter', () => {
    expect(samDeviceCandidates(null)).toEqual([
      {device: 'wasm', dtype: 'fp32'},
    ]);
  });

  it('prefers webgpu fp16 when the adapter supports f16 and the buffer fits', () => {
    const candidates = samDeviceCandidates(makeAdapter(4 * 1024 ** 3));
    expect(candidates[0]).toEqual({device: 'webgpu', dtype: 'fp16'});
  });

  it('skips fp16 when shader-f16 is missing but still allows webgpu fp32', () => {
    const candidates = samDeviceCandidates(makeAdapter(4 * 1024 ** 3, []));
    expect(candidates).toEqual([
      {device: 'webgpu', dtype: 'fp32'},
      {device: 'wasm', dtype: 'fp32'},
    ]);
  });

  it('skips webgpu entirely when the binding limit is the spec default', () => {
    // Regression: the attention buffer needs 384 MB, so a 128 MB cap fails
    // mid-encode with an uncaught WebGPU validation error.
    expect(SAM_ATTENTION_ELEMENTS * 2).toBeGreaterThan(SPEC_DEFAULT_BINDING);
    expect(samDeviceCandidates(makeAdapter(SPEC_DEFAULT_BINDING))).toEqual([
      {device: 'wasm', dtype: 'fp32'},
    ]);
  });

  it('allows fp16 but not fp32 when only the fp16 buffer fits', () => {
    const between = SAM_ATTENTION_ELEMENTS * 2;
    expect(samDeviceCandidates(makeAdapter(between))).toEqual([
      {device: 'webgpu', dtype: 'fp16'},
      {device: 'wasm', dtype: 'fp32'},
    ]);
  });

  it('treats a missing limit as too small rather than assuming it fits', () => {
    expect(samDeviceCandidates(makeAdapter(undefined))).toEqual([
      {device: 'wasm', dtype: 'fp32'},
    ]);
  });

  it('always ends on cpu so an unpredicted failure still has a fallback', () => {
    for (const limit of [0, SPEC_DEFAULT_BINDING, 4 * 1024 ** 3]) {
      const candidates = samDeviceCandidates(makeAdapter(limit));
      expect(candidates.at(-1)).toEqual({device: 'wasm', dtype: 'fp32'});
    }
  });

  it('only ever loads the one model, varying device and precision', () => {
    const candidates = samDeviceCandidates(makeAdapter(4 * 1024 ** 3));
    for (const c of candidates) {
      expect(['webgpu', 'wasm']).toContain(c.device);
      expect(['fp16', 'fp32']).toContain(c.dtype);
    }
  });
});
