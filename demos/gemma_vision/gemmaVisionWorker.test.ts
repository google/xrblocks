import {afterEach, describe, expect, it, vi} from 'vitest';

const constructed = vi.hoisted(
  () => [] as Array<{gpuWrappedAtConstruction: boolean}>
);
const installOptions = vi.hoisted(() => [] as unknown[]);

vi.mock('../gemma_on_device/GemmaRuntime.js', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('../gemma_on_device/GemmaRuntime.js')>();
  return {
    ...actual,
    installWebGpuTimeslicing: (gpu: unknown, options: unknown) => {
      installOptions.push(options);
      return actual.installWebGpuTimeslicing(gpu, options);
    },
  };
});

vi.mock('./GemmaVisionRuntime.js', () => ({
  GemmaVisionRuntime: vi.fn(function (this: {handle: () => void}) {
    const gpu = (globalThis.self as unknown as {navigator: {gpu?: FakeGpu}})
      .navigator.gpu;
    constructed.push({
      gpuWrappedAtConstruction:
        !!gpu && gpu.requestAdapter !== gpu.rawRequestAdapter,
    });
    this.handle = vi.fn();
  }),
}));

type FakeGpu = {
  requestAdapter: () => Promise<unknown>;
  rawRequestAdapter: () => Promise<unknown>;
};

const ANDROID_XR =
  'Mozilla/5.0 (Linux; Android 14; XR) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';
const DESKTOP =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

function fakeGpu() {
  const rawCreateCommandEncoder = vi.fn();
  const device = {
    createCommandEncoder: rawCreateCommandEncoder,
    queue: {submit: vi.fn()},
  };
  const adapter = {requestDevice: vi.fn(async () => device)};
  const rawRequestAdapter = vi.fn(async () => adapter);
  const gpu: FakeGpu = {requestAdapter: rawRequestAdapter, rawRequestAdapter};
  return {gpu, device, rawCreateCommandEncoder};
}

async function startWorker(navigator: Record<string, unknown>) {
  vi.stubGlobal('self', {navigator, postMessage: vi.fn()});
  await import('./gemmaVisionWorker.js');
}

describe('gemmaVisionWorker', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.resetModules();
    constructed.length = 0;
    installOptions.length = 0;
  });

  it('timeslices WebGPU on phones and headsets before the runtime starts', async () => {
    const {gpu, device, rawCreateCommandEncoder} = fakeGpu();
    await startWorker({gpu, userAgent: ANDROID_XR, deviceMemory: 8});

    expect(constructed).toEqual([{gpuWrappedAtConstruction: true}]);
    const adapter = (await gpu.requestAdapter()) as {
      requestDevice: () => Promise<typeof device>;
    };
    const wrapped = await adapter.requestDevice();
    expect(wrapped).toBe(device);
    expect(wrapped.createCommandEncoder).not.toBe(rawCreateCommandEncoder);
  });

  it('uses small fixed GPU batches so headset frames keep landing', async () => {
    const {gpu} = fakeGpu();
    await startWorker({gpu, userAgent: ANDROID_XR, deviceMemory: 8});

    expect(installOptions).toEqual([
      {
        maxDispatchesPerChunk: 8,
        maxDispatchesPerSync: 16,
        adaptiveSync: false,
        maxWorkgroupsPerChunk: 16384,
        maxWorkgroupsPerSync: 65536,
        workBudgetMs: 4,
        yieldMs: 2,
      },
    ]);
  });

  it('timeslices WebGPU on devices that report little memory', async () => {
    const {gpu} = fakeGpu();
    await startWorker({gpu, userAgent: DESKTOP, deviceMemory: 4});

    expect(constructed).toEqual([{gpuWrappedAtConstruction: true}]);
  });

  it('leaves WebGPU untouched on desktops', async () => {
    const {gpu} = fakeGpu();
    await startWorker({gpu, userAgent: DESKTOP, deviceMemory: 8});

    expect(constructed).toEqual([{gpuWrappedAtConstruction: false}]);
    expect(gpu.requestAdapter).toBe(gpu.rawRequestAdapter);
  });

  it('still starts without WebGPU', async () => {
    await startWorker({userAgent: ANDROID_XR});

    expect(constructed).toEqual([{gpuWrappedAtConstruction: false}]);
  });
});
