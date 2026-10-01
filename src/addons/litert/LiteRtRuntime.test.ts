import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const mocks = vi.hoisted(() => ({
  loadLiteRt: vi.fn(),
  isWebGPUSupported: vi.fn(),
  getGlobalLiteRtPromise: vi.fn(),
}));

vi.mock('@litertjs/core', () => mocks);

import {
  DEFAULT_LITERT_WASM_DIR,
  LITERT_THREADED_GLUE_FILE,
  defaultNumThreads,
  describeError,
  loadLiteRtRuntime,
  resetLiteRtRuntimeForTesting,
} from './LiteRtRuntime';

type Scope = {Module?: unknown; crossOriginIsolated?: boolean};
const scope = globalThis as unknown as Scope;

function setIsolated(value: boolean) {
  Object.defineProperty(globalThis, 'crossOriginIsolated', {
    value,
    configurable: true,
    writable: true,
  });
}

describe('loadLiteRtRuntime', () => {
  const liteRt = {name: 'liteRt'};
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    resetLiteRtRuntimeForTesting();
    mocks.loadLiteRt.mockReset().mockResolvedValue(liteRt);
    mocks.isWebGPUSupported.mockReset().mockReturnValue(true);
    mocks.getGlobalLiteRtPromise.mockReset().mockReturnValue(undefined);
    fetchMock = vi
      .fn()
      .mockResolvedValue(new Response('// glue', {status: 200}));
    vi.stubGlobal('fetch', fetchMock);
    setIsolated(false);
    delete scope.Module;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete scope.Module;
  });

  it('loads the single-threaded build when the page is not isolated', async () => {
    const runtime = await loadLiteRtRuntime();
    expect(mocks.loadLiteRt).toHaveBeenCalledTimes(1);
    expect(mocks.loadLiteRt).toHaveBeenCalledWith(DEFAULT_LITERT_WASM_DIR, {
      threads: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(runtime).toMatchObject({
      liteRt,
      threads: false,
      accelerator: 'webgpu',
      wasmDir: DEFAULT_LITERT_WASM_DIR,
    });
  });

  it('reports wasm when WebGPU is unavailable and honors an override', async () => {
    mocks.isWebGPUSupported.mockReturnValue(false);
    expect((await loadLiteRtRuntime()).accelerator).toBe('wasm');
    resetLiteRtRuntimeForTesting();
    expect(
      (await loadLiteRtRuntime({preferAccelerator: 'wasm'})).accelerator
    ).toBe('wasm');
  });

  it('hands the threaded glue over as a blob while loading on an isolated page', async () => {
    setIsolated(true);
    let moduleDuringLoad: unknown;
    mocks.loadLiteRt.mockImplementation(async () => {
      moduleDuringLoad = scope.Module;
      return liteRt;
    });

    const runtime = await loadLiteRtRuntime({
      wasmDir: 'https://cdn.test/wasm/',
    });

    expect(fetchMock).toHaveBeenCalledWith(
      `https://cdn.test/wasm/${LITERT_THREADED_GLUE_FILE}`,
      {mode: 'cors'}
    );
    expect(mocks.loadLiteRt).toHaveBeenCalledWith('https://cdn.test/wasm/', {
      threads: true,
    });
    expect(moduleDuringLoad).toMatchObject({
      mainScriptUrlOrBlob: expect.any(Blob),
    });
    expect(scope.Module).toBeUndefined();
    expect(runtime.threads).toBe(true);
  });

  it('falls back to the single-threaded build when threads fail', async () => {
    setIsolated(true);
    mocks.loadLiteRt
      .mockRejectedValueOnce(new Error('no SharedArrayBuffer'))
      .mockResolvedValueOnce(liteRt);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const runtime = await loadLiteRtRuntime();

    expect(mocks.loadLiteRt).toHaveBeenNthCalledWith(
      1,
      DEFAULT_LITERT_WASM_DIR,
      {
        threads: true,
      }
    );
    expect(mocks.loadLiteRt).toHaveBeenNthCalledWith(
      2,
      DEFAULT_LITERT_WASM_DIR,
      {
        threads: false,
      }
    );
    expect(runtime.threads).toBe(false);
    expect(scope.Module).toBeUndefined();
    expect(warn).toHaveBeenCalled();
  });

  it('skips threads when preferThreads is false even on an isolated page', async () => {
    setIsolated(true);
    await loadLiteRtRuntime({preferThreads: false});
    expect(mocks.loadLiteRt).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('shares one load across callers and allows a retry after failure', async () => {
    mocks.loadLiteRt.mockRejectedValueOnce(new Error('offline'));
    await expect(loadLiteRtRuntime()).rejects.toThrow('offline');

    const first = loadLiteRtRuntime();
    const second = loadLiteRtRuntime();
    expect(second).toBe(first);
    await first;
    expect(mocks.loadLiteRt).toHaveBeenCalledTimes(2);
  });

  it('reuses a runtime another script already loaded', async () => {
    mocks.getGlobalLiteRtPromise.mockReturnValue(Promise.resolve(liteRt));
    const runtime = await loadLiteRtRuntime();
    expect(mocks.loadLiteRt).not.toHaveBeenCalled();
    expect(runtime.liteRt).toBe(liteRt);
    expect(runtime.threads).toBe(false);
  });
});

describe('describeError', () => {
  it('handles errors, strings, events and everything else', () => {
    expect(describeError(new Error('boom'))).toBe('boom');
    expect(describeError('plain')).toBe('plain');
    expect(describeError({type: 'error'})).toBe('error event');
    expect(describeError(42)).toBe('42');
  });
});

describe('defaultNumThreads', () => {
  it('caps the hardware count and never returns less than one', () => {
    vi.stubGlobal('navigator', {hardwareConcurrency: 16});
    expect(defaultNumThreads()).toBe(8);
    expect(defaultNumThreads(2)).toBe(2);
    vi.stubGlobal('navigator', {hardwareConcurrency: 0});
    expect(defaultNumThreads()).toBe(4);
    vi.unstubAllGlobals();
  });
});
