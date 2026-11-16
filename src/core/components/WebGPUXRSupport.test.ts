import {afterEach, expect, it, vi} from 'vitest';
import {
  forwardWebGPUXRFramebufferScaleFactor,
  isWebGPUXRUnavailable,
  resolveWebGPURendererSetup,
  WEBGPU_RADIX_BASELINE_LIMITS,
} from './WebGPUXRSupport';

afterEach(() => vi.unstubAllGlobals());

it.each([
  {xr: true, gpuBinding: false, supported: true, expected: true},
  {xr: true, gpuBinding: true, supported: true, expected: false},
  {
    xr: true,
    gpuBinding: true,
    supported: true,
    adapter: 'null' as const,
    expected: true,
  },
  {
    xr: true,
    gpuBinding: true,
    supported: true,
    adapter: 'error' as const,
    expected: true,
  },
  {
    xr: true,
    gpuBinding: true,
    supported: true,
    adapter: 'ok' as const,
    expected: false,
  },
  {xr: true, gpuBinding: false, supported: false, expected: false},
  {xr: false, gpuBinding: false, supported: false, expected: false},
  {xr: true, gpuBinding: false, supported: 'error', expected: false},
])(
  'chooses a usable renderer when immersive WebGPU XR is unavailable: %j',
  async ({xr, gpuBinding, supported, adapter, expected}) => {
    const gpu = adapter
      ? {
          requestAdapter: async () => {
            if (adapter === 'error') throw new Error('No XR GPU');
            return adapter === 'null' ? null : {limits: {}};
          },
        }
      : undefined;
    vi.stubGlobal(
      'navigator',
      xr
        ? {
            xr: {
              isSessionSupported: async () => {
                if (supported === 'error')
                  throw new Error('Browser support query failed');
                return supported;
              },
            },
            ...(gpu ? {gpu} : {}),
          }
        : {}
    );
    vi.stubGlobal('XRGPUBinding', gpuBinding ? class {} : undefined);
    expect(await isWebGPUXRUnavailable()).toBe(expected);
  }
);

it('clamps WebGPU device limits to adapter capabilities and skips limits on forceWebGL fallback', async () => {
  const requestAdapter = vi.fn().mockResolvedValue({
    limits: {
      maxTextureDimension2D: 8192, // Equal to spec default -> omitted
      maxTextureArrayLayers: 1024, // Clamped below 2048 baseline
      maxStorageBufferBindingSize: 512 << 20, // Capped at 256 MiB baseline unless 'adapter'
      maxStorageBuffersPerShaderStage: 12,
      minStorageBufferOffsetAlignment: 64,
    },
  });
  vi.stubGlobal('XRGPUBinding', class {});
  vi.stubGlobal('navigator', {
    xr: {isSessionSupported: async () => true},
    gpu: {requestAdapter},
  });

  const setup = await resolveWebGPURendererSetup({
    requiredLimits: {
      maxStorageBuffersPerShaderStage: 'adapter',
      minStorageBufferOffsetAlignment: 128,
    },
  });
  expect(requestAdapter).toHaveBeenCalledWith({
    featureLevel: 'compatibility',
    xrCompatible: true,
  });
  expect(setup).toEqual({
    forceWebGL: false,
    requiredLimits: {
      maxTextureArrayLayers: 1024,
      maxStorageBufferBindingSize:
        WEBGPU_RADIX_BASELINE_LIMITS.maxStorageBufferBindingSize,
      maxStorageBuffersPerShaderStage: 12,
      minStorageBufferOffsetAlignment: 128,
    },
  });

  vi.stubGlobal('XRGPUBinding', undefined);
  expect(await resolveWebGPURendererSetup()).toEqual({forceWebGL: true});
});

it('forwards non-default scaleFactor and fixedFoveation into XRGPUBinding.createProjectionLayer', () => {
  const createProjectionLayer = vi.fn(() => ({
    fixedFoveation: null as number | null,
  }));
  const binding = {createProjectionLayer};
  let scaleFactor = 0.75;
  let foveation: number | undefined = 1;
  const xrManager = {
    getFramebufferScaleFactor: () => scaleFactor,
    getFoveation: () => foveation,
    getWebGPUBinding: () => binding,
  };

  forwardWebGPUXRFramebufferScaleFactor(xrManager);
  const patched = xrManager.getWebGPUBinding()!;
  const layer = patched.createProjectionLayer!({
    colorFormat: 'rgba8unorm',
  }) as {fixedFoveation: number | null};

  expect(createProjectionLayer).toHaveBeenLastCalledWith({
    colorFormat: 'rgba8unorm',
    scaleFactor: 0.75,
  });
  expect(layer.fixedFoveation).toBe(1);

  scaleFactor = 1;
  foveation = undefined;
  const defaultLayer = patched.createProjectionLayer!({
    colorFormat: 'rgba8unorm',
  }) as {fixedFoveation: number | null};
  expect(createProjectionLayer).toHaveBeenLastCalledWith({
    colorFormat: 'rgba8unorm',
  });
  expect(defaultLayer.fixedFoveation).toBeNull();
});
