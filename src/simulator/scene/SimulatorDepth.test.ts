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
    readRenderTargetPixelsAsync: vi.fn(() => {
      return new Promise<void>((res) => {
        resolveReadback = res;
      });
    }),
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

  beforeEach(() => {
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
    depthSim.init(renderer.renderer as unknown as THREE.WebGLRenderer, camera, {
      updateCPUDepthData: vi.fn(),
    } as never);
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
