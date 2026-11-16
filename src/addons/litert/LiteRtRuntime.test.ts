import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

const mocks = vi.hoisted(() => ({
  loadLiteRt: vi.fn(),
  isWebGPUSupported: vi.fn(),
  getGlobalLiteRtPromise: vi.fn(),
}));

vi.mock('@litertjs/core', () => mocks);

import {
  DEFAULT_LITERT_WASM_DIR,
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

  it('shares one load across callers and allows a retry after failure', async () => {
    mocks.loadLiteRt.mockRejectedValueOnce(new Error('offline'));
    await expect(loadLiteRtRuntime()).rejects.toThrow('offline');

    const first = loadLiteRtRuntime();
    const second = loadLiteRtRuntime();
    expect(second).toBe(first);
    await first;
    expect(mocks.loadLiteRt).toHaveBeenCalledTimes(2);
  });
});
