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
    const camera = new THREE.PerspectiveCamera();
    depthSim = new SimulatorDepth({overrideMaterial: null} as never);
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
    depthSim.update();
    expect(renderer.renderer.render).toHaveBeenCalledTimes(2);
  });

  it('keeps re-firing on every frame in a steady state once readbacks resolve in order', async () => {
    for (let i = 0; i < 5; i++) {
      depthSim.update();
      renderer.settleReadback();
      await Promise.resolve();
      await Promise.resolve();
    }
    expect(renderer.renderer.render).toHaveBeenCalledTimes(5);
  });
});
