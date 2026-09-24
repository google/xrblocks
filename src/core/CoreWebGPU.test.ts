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

  it('initializes WebGPUOcclusionPass when depth occlusion is enabled with WebGPU', async () => {
    const core = new Core();
    const options = new Options().enableWebGPU();
    options.depth.enabled = true;
    options.depth.occlusion.enabled = true;

    await core.init(options);
    expect(core.depth['occlusionPass']).toBeDefined();
    expect(core.depth['occlusionPass']?.constructor.name).toBe(
      'WebGPUOcclusionPass'
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

  it('initializes XRDeviceCamera when deviceCamera is enabled with WebGPU and disables WebXR camera-access fallback', async () => {
    const core = new Core();
    const options = new Options().enableWebGPU();
    options.deviceCamera.enabled = true;

    await core.init(options);
    expect(core.deviceCamera).toBeDefined();

    await core.deviceCamera!.init();
    expect(core.deviceCamera!.isUsingXRCameraAccess).toBe(false);
  });

  it('initializes XREffects for simulator post-processing when usePostprocessing is enabled with WebGPU, and guards renderXr', async () => {
    const core = new Core();
    const options = new Options().enableWebGPU();
    options.usePostprocessing = true;

    await core.init(options);
    expect(core.effects).toBeDefined();

    const defaultTarget = new THREE.RenderTarget(160, 160, {
      stencilBuffer: true,
    });
    vi.spyOn(core.renderer, 'getRenderTarget').mockReturnValue(
      defaultTarget as unknown as THREE.WebGLRenderTarget
    );

    const passRender = vi.fn();
    core.effects!.addPass({
      enabled: true,
      needsSwap: true,
      clear: false,
      renderToScreen: false,
      setSize: vi.fn(),
      render: passRender,
      dispose: vi.fn(),
    });

    core.effects!.render(core.camera);
    expect(passRender).toHaveBeenCalledTimes(1);
    expect(core.effects!.renderTargets[0].depthTexture?.format).toBe(
      THREE.DepthStencilFormat
    );
    expect(core.effects!.renderTargets[0].depthTexture?.type).toBe(
      THREE.UnsignedInt248Type
    );

    core.renderer.xr.isPresenting = true;
    expect(() => core.effects!.render(core.camera)).toThrow(
      'XREffects.renderXr requires THREE.WebGLRenderer, but Core is configured with WebGPURenderer.'
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

  it('initializes Simulator depth pipeline and DepthMesh when enableDepth is used with WebGPU', async () => {
    const core = new Core();
    const options = new Options().enableWebGPU().enableDepth();
    await core.init(options);

    expect(core.depth.enabled).toBe(true);
    expect(core.depth.depthMesh).toBeDefined();

    const simulator = await core.startSimulator();
    expect(simulator.renderDepthPass).toBe(true);
    expect(simulator.depth.depthMaterial).toBeDefined();
  });

  it('dynamically applies WebGPU NodeMaterial to DepthMesh when showDebugTexture is enabled', async () => {
    const core = new Core();
    const options = new Options().enableWebGPU().enableDepth();
    options.depth.depthMesh.showDebugTexture = true;
    await core.init(options);

    expect(core.depth.depthMesh).toBeDefined();
    expect(core.depth.depthMesh?.material.type).toBe('NodeMaterial');
  });
});
