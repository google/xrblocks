import '../addons/testing/setup';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import * as THREE from 'three';
import type {WebGLOrWebGPURenderer} from '../core/RendererTypes';
import {SimulatorCamera} from './SimulatorCamera';

function createMockRenderer(isWebGPU: boolean): WebGLOrWebGPURenderer {
  const domElement = document.createElement('canvas');
  domElement.width = 1024;
  domElement.height = 512;
  return {
    isWebGPURenderer: isWebGPU,
    domElement,
  } as unknown as WebGLOrWebGPURenderer;
}

describe('SimulatorCamera', () => {
  let drawImageSpy: ReturnType<typeof vi.fn>;
  let stopTrackSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    drawImageSpy = vi.fn();
    stopTrackSpy = vi.fn();
    vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({
      drawImage: drawImageSpy,
    } as unknown as CanvasRenderingContext2D);
    Object.defineProperty(HTMLCanvasElement.prototype, 'captureStream', {
      configurable: true,
      writable: true,
      value: vi.fn().mockImplementation(() => ({
        getVideoTracks: () => [
          {
            readyState: 'live',
            getSettings: () => ({deviceId: 'sim-camera-id'}),
            stop: stopTrackSpy,
          },
        ],
        getTracks: () => [{stop: stopTrackSpy}],
      })),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it.each([
    ['WebGLRenderer', false],
    ['WebGPURenderer', true],
  ])(
    'captures center-cropped frame in onSimulatorSceneRendered with %s',
    async (_label, isWebGPU) => {
      const renderer = createMockRenderer(isWebGPU);
      const simCamera = new SimulatorCamera(renderer);
      simCamera.init();

      const devices = await simCamera.enumerateDevices();
      expect(devices).toHaveLength(1);
      expect(devices[0].deviceId).toBe('sim-camera-id');

      simCamera.onSimulatorSceneRendered();
      expect(drawImageSpy).toHaveBeenCalledTimes(1);
      expect(drawImageSpy).toHaveBeenCalledWith(
        renderer.domElement,
        256,
        0,
        512,
        512,
        0,
        0,
        512,
        512
      );
      simCamera.dispose();
    }
  );

  it.each([
    ['WebGLRenderer', false],
    ['WebGPURenderer', true],
  ])(
    'renders custom camera pose and captures frame in onBeforeSimulatorSceneRender with %s when matchRenderingCamera is false',
    (_label, isWebGPU) => {
      const renderer = createMockRenderer(isWebGPU);
      const simCamera = new SimulatorCamera(renderer);
      simCamera.matchRenderingCamera = false;
      simCamera.init();

      const sourceCamera = new THREE.PerspectiveCamera();
      sourceCamera.position.set(1, 2, 3);
      sourceCamera.quaternion.setFromEuler(new THREE.Euler(0.1, 0.2, 0.3));
      const renderSceneSpy = vi.fn();

      simCamera.onBeforeSimulatorSceneRender(sourceCamera, renderSceneSpy);

      expect(renderSceneSpy).toHaveBeenCalledTimes(1);
      expect(simCamera.camera.position.equals(sourceCamera.position)).toBe(
        true
      );
      expect(simCamera.camera.quaternion.equals(sourceCamera.quaternion)).toBe(
        true
      );
      expect(drawImageSpy).toHaveBeenCalledTimes(1);
      simCamera.dispose();
    }
  );
});
