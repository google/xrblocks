import * as THREE from 'three';
import {beforeEach, describe, expect, it, vi} from 'vitest';

import {SimulatorDepth} from './SimulatorDepth';

// SimulatorDepth.update() spawns an async readback per call. The
// inflight guard prevents stacking a second readback while the first
// is still resolving (the readback uses a setTimeout fence poll that
// typically takes longer than a frame).

function makeMockRenderer() {
  let resolveReadback: (() => void) | null = null;
  const renderer = {
    render: vi.fn(),
    setRenderTarget: vi.fn(),
    getRenderTarget: vi.fn().mockReturnValue(null),
    getClearColor: vi.fn((target?: THREE.Color) => target ?? new THREE.Color()),
    getClearAlpha: vi.fn(() => 0),
    setClearColor: vi.fn(),
    clear: vi.fn(),
    readRenderTargetPixelsAsync: vi.fn(
      (
        _target: unknown,
        _x: number,
        _y: number,
        _w: number,
        _h: number,
        buffer?: Float32Array
      ) => {
        return new Promise<THREE.TypedArray>((res) => {
          resolveReadback = () => res(buffer ?? new Float32Array());
        });
      }
    ),
    getContext: vi.fn(() => ({
      bindBuffer: vi.fn(),
      PIXEL_PACK_BUFFER: 0x88eb,
    })),
  };
  return {
    renderer,
    settleReadback: () => {
      const r = resolveReadback;
      resolveReadback = null;
      r?.();
    },
    pendingReadback: () => resolveReadback !== null,
  };
}

describe('SimulatorDepth.update inflight guard', () => {
  let depthSim: SimulatorDepth;
  let renderer: ReturnType<typeof makeMockRenderer>;
  let camera: THREE.PerspectiveCamera;
  let simulatorScene: THREE.Scene;
  let movingObject: THREE.Object3D;

  /** Move the view so the depth buffer is genuinely out of date. */
  const moveCamera = () => {
    camera.position.x += 1;
  };

  /** Move something the depth pass draws, leaving the camera alone. */
  const moveSceneObject = () => {
    movingObject.position.z += 1;
    movingObject.updateMatrixWorld(true);
  };

  /** Run update() and let the readback settle so the next call is unblocked. */
  const settledUpdate = async () => {
    depthSim.update();
    renderer.settleReadback();
    await Promise.resolve();
    await Promise.resolve();
  };

  beforeEach(async () => {
    // jsdom doesn't ship XRRigidTransform; the readback path constructs
    // one so stub it before init.
    (globalThis as unknown as {XRRigidTransform: unknown}).XRRigidTransform =
      class {
        constructor(
          public position: unknown,
          public orientation: unknown
        ) {}
      };
    renderer = makeMockRenderer();
    camera = new THREE.PerspectiveCamera();
    simulatorScene = new THREE.Scene();
    movingObject = new THREE.Object3D();
    simulatorScene.add(movingObject);
    simulatorScene.updateMatrixWorld(true);
    depthSim = new SimulatorDepth(simulatorScene as never);
    await depthSim.init(
      renderer.renderer as unknown as THREE.WebGLRenderer,
      camera,
      {
        updateCPUDepthData: vi.fn(),
      } as never
    );
  });

  it('renders + starts a readback on the first update', () => {
    depthSim.update();
    expect(renderer.renderer.render).toHaveBeenCalledTimes(1);
    expect(renderer.renderer.readRenderTargetPixelsAsync).toHaveBeenCalledTimes(
      1
    );
  });

  it('does NOT queue a second pass while an earlier readback is still in flight', () => {
    depthSim.update();
    expect(renderer.pendingReadback()).toBe(true);
    depthSim.update();
    depthSim.update();
    expect(renderer.renderer.render).toHaveBeenCalledTimes(1);
    expect(renderer.renderer.readRenderTargetPixelsAsync).toHaveBeenCalledTimes(
      1
    );
  });

  it('runs a fresh pass once the inflight readback resolves', async () => {
    depthSim.update();
    renderer.settleReadback();
    // Flush the .finally() chain.
    await Promise.resolve();
    await Promise.resolve();
    moveCamera();
    depthSim.update();
    expect(renderer.renderer.render).toHaveBeenCalledTimes(2);
  });

  it('keeps re-firing on every frame in a steady state once readbacks resolve in order', async () => {
    for (let i = 0; i < 5; i++) {
      moveCamera();
      depthSim.update();
      renderer.settleReadback();
      await Promise.resolve();
      await Promise.resolve();
    }
    expect(renderer.renderer.render).toHaveBeenCalledTimes(5);
  });

  it('skips the render and readback while the view is stationary', async () => {
    depthSim.update();
    renderer.settleReadback();
    await Promise.resolve();
    await Promise.resolve();

    // Same camera, so the depth buffer would come back identical.
    depthSim.update();
    depthSim.update();

    expect(renderer.renderer.render).toHaveBeenCalledTimes(1);
    expect(renderer.renderer.readRenderTargetPixelsAsync).toHaveBeenCalledTimes(
      1
    );
  });

  it('refreshes a stationary view once the buffer goes stale', async () => {
    depthSim.update();
    renderer.settleReadback();
    await Promise.resolve();
    await Promise.resolve();

    // Two reasons this has to keep firing with nothing moving. The scene can
    // animate in ways a transform hash cannot see, and the detectors cache a
    // cloned depth mesh keyed on the position attribute version, so the
    // version has to keep advancing or those caches never invalidate.
    depthSim.maxDepthAgeMs = 0;
    depthSim.update();

    expect(renderer.renderer.render).toHaveBeenCalledTimes(2);
  });

  it('re-renders as soon as the view moves again', async () => {
    await settledUpdate();

    depthSim.update();
    expect(renderer.renderer.render).toHaveBeenCalledTimes(1);

    moveCamera();
    depthSim.update();
    expect(renderer.renderer.render).toHaveBeenCalledTimes(2);
  });

  it('re-renders when something in the scene moves under a still camera', async () => {
    await settledUpdate();

    // Nothing moved, so this one is skipped.
    depthSim.update();
    expect(renderer.renderer.render).toHaveBeenCalledTimes(1);

    // The camera is still, but the world in front of it is not.
    moveSceneObject();
    depthSim.update();
    expect(renderer.renderer.render).toHaveBeenCalledTimes(2);
  });

  it('re-renders when something in the scene is hidden or shown', async () => {
    await settledUpdate();

    movingObject.visible = false;
    depthSim.update();
    expect(renderer.renderer.render).toHaveBeenCalledTimes(2);

    renderer.settleReadback();
    await Promise.resolve();
    await Promise.resolve();

    movingObject.visible = true;
    depthSim.update();
    expect(renderer.renderer.render).toHaveBeenCalledTimes(3);
  });

  it('re-renders when a new object is added to the scene', async () => {
    await settledUpdate();

    const added = new THREE.Object3D();
    added.position.set(2, 0, 0);
    simulatorScene.add(added);
    simulatorScene.updateMatrixWorld(true);

    depthSim.update();
    expect(renderer.renderer.render).toHaveBeenCalledTimes(2);
  });
});

describe('SimulatorDepth with WebGPURenderer', () => {
  beforeEach(() => {
    (globalThis as unknown as {XRRigidTransform: unknown}).XRRigidTransform =
      class {
        constructor(
          public position: unknown,
          public orientation: unknown
        ) {}
      };
  });

  it('dynamically loads NodeMaterial and unpacks 256-byte row-aligned native WebGPU buffers without Y-flip', async () => {
    // For width = 160 floats (640 bytes), WebGPU pads bytesPerRow to 768 bytes (192 floats per row).
    // Total buffer size = (159 * 192) + 160 = 30688 floats.
    const rowStride = 192;
    const width = 160;
    const height = 160;
    const paddedBuffer = new Float32Array((height - 1) * rowStride + width);
    // Write distinctive values for row 0 (top) and row 159 (bottom).
    paddedBuffer[0] = 1.25;
    paddedBuffer[(height - 1) * rowStride] = 4.75;

    const mockWebGPURenderer = {
      isWebGPURenderer: true,
      backend: {isWebGPUBackend: true},
      render: vi.fn(),
      setRenderTarget: vi.fn(),
      getRenderTarget: vi.fn().mockReturnValue(null),
      getClearColor: vi.fn(
        (target?: THREE.Color) => target ?? new THREE.Color()
      ),
      getClearAlpha: vi.fn(() => 0),
      setClearColor: vi.fn(),
      clear: vi.fn(),
      readRenderTargetPixelsAsync: vi.fn().mockResolvedValue(paddedBuffer),
    };

    const camera = new THREE.PerspectiveCamera();
    const simulatorScene = new THREE.Scene();
    const depthSim = new SimulatorDepth(simulatorScene as never);
    const updateCPUDepthData = vi.fn();

    await depthSim.init(mockWebGPURenderer as never, camera, {
      updateCPUDepthData,
    } as never);

    expect(depthSim.depthMaterial).toBeDefined();
    expect(depthSim.depthRenderTarget).toBeInstanceOf(THREE.RenderTarget);

    depthSim.update();
    await Promise.resolve();
    await Promise.resolve();

    expect(mockWebGPURenderer.readRenderTargetPixelsAsync).toHaveBeenCalledWith(
      depthSim.depthRenderTarget,
      0,
      0,
      width,
      height
    );
    expect(updateCPUDepthData).toHaveBeenCalledTimes(1);
    const depthInfo = updateCPUDepthData.mock.calls[0][0] as {
      data: ArrayBuffer;
      width: number;
      height: number;
    };
    const unpacked = new Float32Array(depthInfo.data);
    expect(unpacked.length).toBe(width * height);
    // Native WebGPU is top-to-bottom: row 0 stays row 0, row 159 stays row 159.
    expect(unpacked[0]).toBeCloseTo(1.25);
    expect(unpacked[(height - 1) * width]).toBeCloseTo(4.75);
  });

  it('flips rows vertically when WebGPURenderer uses the WebGL2 fallback backend', async () => {
    const width = 160;
    const height = 160;
    const tightBuffer = new Float32Array(width * height);
    // In WebGL fallback, row 0 in readPixels is the bottom of the screen.
    tightBuffer[0] = 9.5; // bottom row in GL
    tightBuffer[(height - 1) * width] = 2.5; // top row in GL

    const mockWebGPURenderer = {
      isWebGPURenderer: true,
      backend: {isWebGLBackend: true},
      render: vi.fn(),
      setRenderTarget: vi.fn(),
      getRenderTarget: vi.fn().mockReturnValue(null),
      getClearColor: vi.fn(
        (target?: THREE.Color) => target ?? new THREE.Color()
      ),
      getClearAlpha: vi.fn(() => 0),
      setClearColor: vi.fn(),
      clear: vi.fn(),
      readRenderTargetPixelsAsync: vi.fn().mockResolvedValue(tightBuffer),
    };

    const camera = new THREE.PerspectiveCamera();
    const simulatorScene = new THREE.Scene();
    const depthSim = new SimulatorDepth(simulatorScene as never);
    const updateCPUDepthData = vi.fn();

    await depthSim.init(mockWebGPURenderer as never, camera, {
      updateCPUDepthData,
    } as never);

    depthSim.update();
    await Promise.resolve();
    await Promise.resolve();

    expect(updateCPUDepthData).toHaveBeenCalledTimes(1);
    const depthInfo = updateCPUDepthData.mock.calls[0][0] as {
      data: ArrayBuffer;
    };
    const unpacked = new Float32Array(depthInfo.data);
    // Top row of output (row 0) should come from row 159 of GL readback.
    expect(unpacked[0]).toBeCloseTo(2.5);
    expect(unpacked[(height - 1) * width]).toBeCloseTo(9.5);
  });

  it('configures SimulatorDepthWebGPURenderer material with NoBlending and forceSinglePass', async () => {
    const {SimulatorDepthWebGPURenderer} = await import(
      './SimulatorDepthWebGPURenderer'
    );
    const backend = new SimulatorDepthWebGPURenderer({} as never);
    expect(backend.depthMaterial.blending).toBe(THREE.NoBlending);
    expect(backend.depthMaterial.forceSinglePass).toBe(true);
    backend.dispose();
  });
});
