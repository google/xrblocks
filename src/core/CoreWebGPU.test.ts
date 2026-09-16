import '../addons/testing/setup';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import * as THREE from 'three';
import {Core} from './Core';
import {Options} from './Options';
import {isWebGPURenderer} from './RendererTypes';
import {Script} from './Script';

describe('Core with WebGPURenderer', () => {
  beforeEach(async () => {
    await Core.instance?.dispose();
    Core.instance = undefined;
    vi.stubGlobal('navigator', {
      ...navigator,
      xr: {
        isSessionSupported: vi.fn().mockResolvedValue(true),
        requestSession: vi.fn(),
      },
    });
  });

  afterEach(async () => {
    await Core.instance?.dispose();
    Core.instance = undefined;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('initializes Core with THREE.WebGLRenderer by default', async () => {
    const core = new Core();
    const options = new Options();
    await core.init(options);

    expect(isWebGPURenderer(core.renderer)).toBe(false);
    expect(core.renderer).toBeInstanceOf(THREE.WebGLRenderer);
  });

  it('initializes Core with WebGPURenderer and awaits renderer.init() when enableWebGPU is called', async () => {
    const core = new Core();
    const options = new Options().enableWebGPU();
    await core.init(options);

    expect(isWebGPURenderer(core.renderer)).toBe(true);
    const mockRenderer = core.renderer as unknown as {
      init: ReturnType<typeof vi.fn>;
    };
    expect(mockRenderer.init).toHaveBeenCalledTimes(1);
  });

  it('fails loudly during initialization when a script depends on THREE.WebGLRenderer with WebGPU enabled', async () => {
    const core = new Core();
    const options = new Options().enableWebGPU();
    await core.init(options);

    class WebGLDependentScript extends Script {
      static dependencies = {
        renderer: THREE.WebGLRenderer,
      };
    }

    const script = new WebGLDependentScript();
    await expect(core.scriptsManager.initScript(script)).rejects.toThrow(
      'Dependency not found for key: WebGLRenderer'
    );
  });

  it('throws a descriptive error from assertWebGLRenderer when depth is enabled with WebGPU', async () => {
    const core = new Core();
    const options = new Options().enableWebGPU();
    options.depth.enabled = true;

    await expect(core.init(options)).rejects.toThrow(
      'Depth requires THREE.WebGLRenderer, but Core is configured with WebGPURenderer.'
    );
  });

  it('throws a descriptive error from assertWebGLRenderer when lighting is enabled with WebGPU', async () => {
    const core = new Core();
    const options = new Options().enableWebGPU();
    options.lighting.enabled = true;

    await expect(core.init(options)).rejects.toThrow(
      'Lighting requires THREE.WebGLRenderer, but Core is configured with WebGPURenderer.'
    );
  });

  it('throws a descriptive error from assertWebGLRenderer when deviceCamera is enabled with WebGPU', async () => {
    const core = new Core();
    const options = new Options().enableWebGPU();
    options.deviceCamera.enabled = true;

    await expect(core.init(options)).rejects.toThrow(
      'XRDeviceCamera requires THREE.WebGLRenderer, but Core is configured with WebGPURenderer.'
    );
  });

  it('throws a descriptive error from assertWebGLRenderer when usePostprocessing is enabled with WebGPU', async () => {
    const core = new Core();
    const options = new Options().enableWebGPU();
    options.usePostprocessing = true;

    await expect(core.init(options)).rejects.toThrow(
      'XREffects requires THREE.WebGLRenderer, but Core is configured with WebGPURenderer.'
    );
  });

  it('initializes Simulator via startSimulator without throwing WebGLRenderer dependency error when WebGPU is enabled', async () => {
    const core = new Core();
    const options = new Options().enableWebGPU();
    await core.init(options);

    const simulator = await core.startSimulator();
    expect(simulator).toBeDefined();
    expect(core.simulator).toBe(simulator);
    expect(simulator.renderer).toBe(core.renderer);
  });
});
