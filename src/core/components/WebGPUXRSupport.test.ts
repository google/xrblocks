import {afterEach, describe, expect, it, vi} from 'vitest';

import {isWebGPUXRUnavailable} from './WebGPUXRSupport';

function stubXR(isSessionSupported: (mode: string) => Promise<boolean>) {
  vi.stubGlobal('navigator', {...navigator, xr: {isSessionSupported}});
}

describe('isWebGPUXRUnavailable', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('is true when an immersive mode is supported without XRGPUBinding', async () => {
    stubXR(async (mode) => mode === 'immersive-vr');
    expect(await isWebGPUXRUnavailable()).toBe(true);
  });

  it('is false when XRGPUBinding is available', async () => {
    stubXR(async () => true);
    vi.stubGlobal('XRGPUBinding', class {});
    expect(await isWebGPUXRUnavailable()).toBe(false);
  });

  it('is false when no immersive mode is supported', async () => {
    stubXR(async () => false);
    expect(await isWebGPUXRUnavailable()).toBe(false);
  });

  it('is false without WebXR', async () => {
    vi.stubGlobal('navigator', {...navigator, xr: undefined});
    expect(await isWebGPUXRUnavailable()).toBe(false);
  });

  it('treats a failed support check as unsupported', async () => {
    stubXR(async () => {
      throw new Error('SecurityError');
    });
    expect(await isWebGPUXRUnavailable()).toBe(false);
  });
});
