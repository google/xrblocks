import {afterEach, expect, it, vi} from 'vitest';
import {isWebGPUXRUnavailable} from './WebGPUXRSupport';

afterEach(() => vi.unstubAllGlobals());

it.each([
  {xr: true, gpuBinding: false, supported: true, expected: true},
  {xr: true, gpuBinding: true, supported: true, expected: false},
  {xr: true, gpuBinding: false, supported: false, expected: false},
  {xr: false, gpuBinding: false, supported: false, expected: false},
  {xr: true, gpuBinding: false, supported: 'error', expected: false},
])(
  'chooses a usable renderer when immersive WebGPU XR is unavailable: %j',
  async ({xr, gpuBinding, supported, expected}) => {
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
          }
        : {}
    );
    vi.stubGlobal('XRGPUBinding', gpuBinding ? class {} : undefined);
    expect(await isWebGPUXRUnavailable()).toBe(expected);
  }
);
