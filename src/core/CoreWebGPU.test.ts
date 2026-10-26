import '../addons/testing/setup';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import * as THREE from 'three';
import {AnchorManager} from '../world/anchors/AnchorManager';
import {FaceRecognizer} from '../world/faces/FaceRecognizer';
import {HumanRecognizer} from '../world/humans/HumanRecognizer';
import {MeshDetector} from '../world/mesh/MeshDetector';
import {ObjectDetector} from '../world/objects/ObjectDetector';
import {PlaneDetector} from '../world/planes/PlaneDetector';
import {XRTransition} from './components/XRTransition';
import {Core} from './Core';
import {Options} from './Options';
import {isWebGPURenderer} from './RendererTypes';
import {Script} from './Script';

function rendererParameters(core: Core) {
  return (core.renderer as unknown as {parameters: {forceWebGL?: boolean}})
    .parameters;
}

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

  it('requests webgpu as optional feature when rendererBackend is webgpu', async () => {
    vi.stubGlobal('XRGPUBinding', class {});
    const core = new Core();
    const options = new Options().enableWebGPU();
    await core.init(options);

    const session = core.webXRSessionManager!.getSessionOptions();
    expect(session.optionalFeatures).toContain('webgpu');
    expect(rendererParameters(core).forceWebGL).toBe(false);
  });

  it('uses the WebGL backend when the device supports XR but not WebGPU XR', async () => {
    const core = new Core();
    const options = new Options().enableWebGPU();
    await core.init(options);

    expect(isWebGPURenderer(core.renderer)).toBe(true);
    expect(rendererParameters(core).forceWebGL).toBe(true);
    const session = core.webXRSessionManager!.getSessionOptions();
    expect(session.optionalFeatures).not.toContain('webgpu');
  });

  it('keeps the WebGPU backend when no immersive session is supported', async () => {
    vi.stubGlobal('navigator', {
      ...navigator,
      xr: {
        isSessionSupported: vi.fn().mockResolvedValue(false),
        requestSession: vi.fn(),
      },
    });
    const core = new Core();
    const options = new Options().enableWebGPU();
    await core.init(options);

    expect(rendererParameters(core).forceWebGL).toBe(false);
  });

  it('respects an explicit forceWebGL: false on a device without WebGPU XR', async () => {
    const core = new Core();
    const options = new Options().enableWebGPU();
    options.webgpuOptions = {forceWebGL: false};
    await core.init(options);

    expect(rendererParameters(core).forceWebGL).toBe(false);
    const session = core.webXRSessionManager!.getSessionOptions();
    expect(session.optionalFeatures).toContain('webgpu');
  });

  it('does not request webgpu in optional features when rendererBackend is webgl', async () => {
    const core = new Core();
    const options = new Options();
    await core.init(options);

    const session = core.webXRSessionManager!.getSessionOptions();
    expect(session.optionalFeatures).not.toContain('webgpu');
  });

  it.each(['webgl', 'webgpu'] as const)(
    'requests enabled hand tracking as optional with %s',
    async (backend) => {
      const core = new Core();
      const options = new Options().enableHands();
      if (backend === 'webgpu') options.enableWebGPU();
      await core.init(options);

      const session = core.webXRSessionManager!.getSessionOptions();
      expect(session.optionalFeatures).toContain('hand-tracking');
      expect(session.requiredFeatures).not.toContain('hand-tracking');
      expect(core.user.hands).toBeDefined();
      expect(core.user.hands!.getIndexTip()).toBeUndefined();
      expect(() => core.input.sampleSources()).not.toThrow();
      expect(core.input.getFrame().directTouches).toHaveLength(0);
    }
  );

  it('does not request hand tracking when disabled and preserves explicitly required features', async () => {
    const core = new Core();
    const options = new Options();
    options.hands.enabled = false;
    options.webxrRequiredFeatures = ['local-floor'];
    await core.init(options);
    const session = core.webXRSessionManager!.getSessionOptions();
    expect(session.optionalFeatures).not.toContain('hand-tracking');
    expect(session.requiredFeatures).toContain('local-floor');
  });

  it('preserves an explicit requirement for hand tracking', async () => {
    const core = new Core();
    const options = new Options().enableHands();
    options.webxrRequiredFeatures = ['hand-tracking'];
    await core.init(options);

    expect(
      core.webXRSessionManager!.getSessionOptions().requiredFeatures
    ).toContain('hand-tracking');
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

  it('initializes world sensors and XRTransition via RendererHolder when WebGPU is enabled', async () => {
    const core = new Core();
    const options = new Options()
      .enableWebGPU()
      .enablePlaneDetection()
      .enableObjectDetection()
      .enableHumanDetection()
      .enableFaceDetection()
      .enableXRTransitions();
    options.world.enableMeshDetection();
    options.world.enableAnchors();
    await core.init(options);

    expect(core.world.planes).toBeInstanceOf(PlaneDetector);
    expect(core.world.meshes).toBeInstanceOf(MeshDetector);
    expect(core.world.anchors).toBeInstanceOf(AnchorManager);
    expect(core.world.objects).toBeInstanceOf(ObjectDetector);
    expect(core.world.humans).toBeInstanceOf(HumanRecognizer);
    expect(core.world.faces).toBeInstanceOf(FaceRecognizer);
    expect(core.transition).toBeInstanceOf(XRTransition);
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

  it('initializes Lighting when lighting is enabled with WebGPU', async () => {
    const core = new Core();
    const options = new Options().enableWebGPU();
    options.lighting.enabled = true;

    await core.init(options);
    expect(core.lighting).toBeDefined();
    expect(core.lighting?.dirLight).toBeDefined();
    expect(core.lighting?.ambientProbe).toBeDefined();
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

  it.each([
    [[], ['cpu-optimized', 'gpu-optimized']],
    [
      ['gpu-optimized', 'cpu-optimized'],
      ['cpu-optimized', 'gpu-optimized'],
    ],
    [['cpu-optimized'], ['cpu-optimized']],
    [['gpu-optimized'], ['gpu-optimized']],
  ] as XRDepthUsage[][][])(
    'puts CPU depth first with WebGPU, since GPU depth needs an XRWebGLBinding (%j -> %j)',
    async (preference, expected) => {
      const core = new Core();
      const options = new Options().enableWebGPU().enableDepth();
      options.depth.usagePreference = preference;
      await core.init(options);

      const session = core.webXRSessionManager!.getSessionOptions();
      expect(session.depthSensing?.usagePreference).toEqual(expected);
    }
  );

  it('keeps the depth usage preference with WebGL', async () => {
    const core = new Core();
    const options = new Options().enableDepth();
    options.depth.usagePreference = ['gpu-optimized', 'cpu-optimized'];
    await core.init(options);

    const session = core.webXRSessionManager!.getSessionOptions();
    expect(session.depthSensing?.usagePreference).toEqual([
      'gpu-optimized',
      'cpu-optimized',
    ]);
  });
});
