import {describe, it, expect, vi, afterEach} from 'vitest';

import {
  SAM_ATTENTION_ELEMENTS,
  samDeviceCandidates,
  type SamGpuAdapterInfo,
} from './SamDevice';

/** WebGPU spec default, and the limit many mobile / XR GPUs report. */
const SPEC_DEFAULT_BINDING = 134217728;
const PLENTY = 4 * 1024 ** 3;

function makeAdapter(
  maxStorageBufferBindingSize: number | undefined,
  features: string[] = ['shader-f16']
): SamGpuAdapterInfo {
  return {
    features: {has: (f: string) => features.includes(f)},
    limits: {maxStorageBufferBindingSize},
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('samDeviceCandidates', () => {
  it('uses cpu only when there is no adapter', () => {
    expect(samDeviceCandidates(null)).toEqual([
      {device: 'wasm', dtype: 'fp32'},
    ]);
  });

  it('prefers webgpu fp16 when the adapter supports shader-f16', () => {
    expect(samDeviceCandidates(makeAdapter(PLENTY))[0]).toEqual({
      device: 'webgpu',
      dtype: 'fp16',
    });
  });

  it('skips fp16 when shader-f16 is missing but still uses the gpu', () => {
    expect(samDeviceCandidates(makeAdapter(PLENTY, []))).toEqual([
      {device: 'webgpu', dtype: 'fp32'},
      {device: 'wasm', dtype: 'fp32'},
    ]);
  });

  it('stays on the gpu when the binding limit is the spec default', () => {
    // Regression: routing these devices to wasm blocks the main thread for
    // over a minute, which is far worse than the recoverable validation
    // warnings the oversized binding produces.
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(SAM_ATTENTION_ELEMENTS * 2).toBeGreaterThan(SPEC_DEFAULT_BINDING);
    expect(samDeviceCandidates(makeAdapter(SPEC_DEFAULT_BINDING))[0]).toEqual({
      device: 'webgpu',
      dtype: 'fp16',
    });
  });

  it('warns when the binding limit is too small for the attention buffer', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    samDeviceCandidates(makeAdapter(SPEC_DEFAULT_BINDING));
    expect(warn).toHaveBeenCalledOnce();
    expect(String(warn.mock.calls[0][0])).toContain(
      String(SPEC_DEFAULT_BINDING)
    );
  });

  it('does not warn when the binding limit is large enough', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    samDeviceCandidates(makeAdapter(PLENTY));
    expect(warn).not.toHaveBeenCalled();
  });

  it('treats a missing limit as too small and warns, but still uses the gpu', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const candidates = samDeviceCandidates(makeAdapter(undefined));
    expect(warn).toHaveBeenCalledOnce();
    expect(candidates[0].device).toBe('webgpu');
  });

  it('always ends on cpu so an unpredicted load failure has a fallback', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const limit of [0, SPEC_DEFAULT_BINDING, PLENTY]) {
      expect(samDeviceCandidates(makeAdapter(limit)).at(-1)).toEqual({
        device: 'wasm',
        dtype: 'fp32',
      });
    }
  });

  it('never puts cpu ahead of a gpu configuration', () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    for (const limit of [0, SPEC_DEFAULT_BINDING, PLENTY]) {
      const candidates = samDeviceCandidates(makeAdapter(limit));
      const firstCpu = candidates.findIndex((c) => c.device === 'wasm');
      const lastGpu = candidates.map((c) => c.device).lastIndexOf('webgpu');
      expect(firstCpu).toBeGreaterThan(lastGpu);
    }
  });

  it('only ever loads the one model, varying device and precision', () => {
    for (const c of samDeviceCandidates(makeAdapter(PLENTY))) {
      expect(['webgpu', 'wasm']).toContain(c.device);
      expect(['fp16', 'fp32']).toContain(c.dtype);
    }
  });
});
