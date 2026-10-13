import * as THREE from 'three';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import '../addons/testing/setup';
import {
  createUnifiedPanelMaterial,
  ensureWebGPUUIMaterials,
} from '../ui/internal/PanelMaterialFactory';
import {Core} from './Core';
import {Options} from './Options';
import {RendererHolder} from './RendererTypes';
import {Script} from './Script';
import {
  isSerializerRenderer,
  type SerializerRenderer,
  type SerializerXRManager,
} from './SerializerTypes';

function createMockSerializer(): SerializerRenderer & {
  stepAnimationFrame: (timeMs: number) => void;
  controllers: THREE.XRTargetRaySpace[];
} {
  const controllers: THREE.XRTargetRaySpace[] = [
    new THREE.Group() as unknown as THREE.XRTargetRaySpace,
    new THREE.Group() as unknown as THREE.XRTargetRaySpace,
  ];
  const grips: THREE.XRGripSpace[] = [
    new THREE.Group() as unknown as THREE.XRGripSpace,
    new THREE.Group() as unknown as THREE.XRGripSpace,
  ];
  const hands: THREE.XRHandSpace[] = [
    Object.assign(new THREE.Group(), {
      joints: {},
    }) as unknown as THREE.XRHandSpace,
    Object.assign(new THREE.Group(), {
      joints: {},
    }) as unknown as THREE.XRHandSpace,
  ];
  const xrCamera = new THREE.ArrayCamera([
    new THREE.PerspectiveCamera(),
    new THREE.PerspectiveCamera(),
  ]);

  const xr: SerializerXRManager = {
    enabled: true,
    isPresenting: true,
    getController: vi.fn((index: number) => controllers[index]),
    getControllerGrip: vi.fn((index: number) => grips[index]),
    getHand: vi.fn((index: number) => hands[index]),
    getFrame: vi.fn(() => undefined),
    getCamera: vi.fn(() => xrCamera),
    updateCamera: vi.fn(),
    setReferenceSpaceType: vi.fn(),
    setFramebufferScaleFactor: vi.fn(),
    setSession: vi.fn().mockResolvedValue(undefined),
    getSession: vi.fn(() => null),
  };

  let animationLoop: ((time: number, frame?: XRFrame) => void) | null = null;
  let width = 0;
  let height = 0;
  let pixelRatio = 1;

  return {
    isSplitEngineSerializer: true,
    xr,
    controllers,
    render: vi.fn(),
    setSize: vi.fn((w: number, h: number) => {
      width = w;
      height = h;
    }),
    getSize: vi.fn((target?: {set?: (w: number, h: number) => void}) => {
      target?.set?.(width, height);
      return {width, height};
    }),
    setPixelRatio: vi.fn((ratio: number) => {
      pixelRatio = ratio;
    }),
    getPixelRatio: vi.fn(() => pixelRatio),
    setAnimationLoop: vi.fn(
      (cb: ((time: number, frame?: XRFrame) => void) | null) => {
        animationLoop = cb;
      }
    ),
    stepAnimationFrame(timeMs: number) {
      animationLoop?.(timeMs);
    },
    dispose: vi.fn(),
  };
}

describe('Core with SerializerRenderer', () => {
  beforeEach(async () => {
    await Core.instance?.dispose();
    Core.instance = undefined;
  });

  afterEach(async () => {
    await Core.instance?.dispose();
    Core.instance = undefined;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('initializes Core with SerializerRenderer via enableSerializer and runs script lifecycle without DOM XRButton', async () => {
    const core = new Core();
    const serializer = createMockSerializer();
    const options = new Options().enableSerializer(serializer);

    const initSpy = vi.fn();
    const sessionStartedSpy = vi.fn();
    const updateSpy = vi.fn();

    class TestScript extends Script {
      static dependencies = {
        rendererHolder: RendererHolder,
      };
      init(deps: {rendererHolder: RendererHolder}) {
        initSpy(deps.rendererHolder.renderer);
      }
      onXRSessionStarted() {
        sessionStartedSpy();
      }
      update() {
        updateSpy();
      }
    }

    const script = new TestScript();
    core.scene.add(script);

    await core.init(options);

    expect(isSerializerRenderer(core.renderer)).toBe(true);
    expect(core.renderer).toBe(serializer);
    expect(core.xrButton).toBeUndefined();
    expect(core.webXRSessionManager).toBeUndefined();
    expect(core.simulatorRunning).toBe(false);
    expect(initSpy).toHaveBeenCalledWith(serializer);
    expect(sessionStartedSpy).toHaveBeenCalledTimes(1);

    serializer.stepAnimationFrame(16.67);
    expect(updateSpy).toHaveBeenCalledTimes(1);
    expect(serializer.xr.updateCamera).toHaveBeenCalledWith(core.camera);
    expect(serializer.render).toHaveBeenCalledWith(core.scene, core.camera);
  });

  it('upgrades reticles to TSL NodeMaterial when SerializerRenderer is used', async () => {
    const core = new Core();
    const serializer = createMockSerializer();
    const options = new Options().useSerializer(() => serializer);

    await core.init(options);

    const controller = core.input.controllers[0];
    expect(controller.reticle).toBeDefined();
    expect(
      (
        controller.reticle!.material as THREE.Material & {
          isNodeMaterial?: boolean;
        }
      ).isNodeMaterial
    ).toBe(true);
  });

  it('registers TSL NodeMaterial UI panel materials when SerializerRenderer is used', async () => {
    const core = new Core();
    const serializer = createMockSerializer();
    const options = new Options().enableSerializer(serializer);

    await core.init(options);
    await ensureWebGPUUIMaterials();

    const material = createUnifiedPanelMaterial({uniforms: {}});
    expect('colorNode' in material).toBe(true);
    material.dispose();
  });

  it('forwards controller.userData.lastIntersection into RaySourceInput.intersections', async () => {
    const core = new Core();
    const serializer = createMockSerializer();
    const options = new Options().enableSerializer(serializer);

    await core.init(options);

    const targetMesh = new THREE.Mesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial()
    );
    core.scene.add(targetMesh);

    const leftController = serializer.controllers[0];
    leftController.dispatchEvent({
      type: 'connected',
      data: {
        handedness: 'left',
        targetRayMode: 'tracked-pointer',
        profiles: ['generic-trigger'],
      } as unknown as XRInputSource,
    });

    const hitPoint = new THREE.Vector3(0.1, 0.2, -1.5);
    leftController.userData.lastIntersection = {
      object: targetMesh,
      point: hitPoint,
      distance: 1.5,
    };

    const frame = core.input.getFrame();
    expect(frame.raySources).toHaveLength(1);
    expect(frame.raySources[0].intersections).toEqual([
      {
        object: targetMesh,
        point: hitPoint,
        distance: 1.5,
      },
    ]);
  });

  it('throws a descriptive error from assertWebGLRenderer when lighting is enabled with SerializerRenderer', async () => {
    const core = new Core();
    const serializer = createMockSerializer();
    const options = new Options().enableSerializer(serializer);
    options.lighting.enabled = true;

    await expect(core.init(options)).rejects.toThrow(
      'Lighting requires THREE.WebGLRenderer, but Core is configured with SerializerRenderer.'
    );
  });
});
