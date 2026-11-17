import * as THREE from 'three';
import {describe, expect, it} from 'vitest';
import {Registry} from '../../../core/components/Registry';
import {createSimulatorCompositor} from './SimulatorCompositor';

// Capture submissions at the GPU boundary; run the real compositors and quads.
function rendererBoundary(isWebGPURenderer: boolean) {
  let target: THREE.RenderTarget | null = null;
  const draws: {
    object: THREE.Object3D;
    camera: THREE.Camera;
    target: THREE.RenderTarget | null;
  }[] = [];
  const renderer = {
    isWebGPURenderer,
    domElement: {width: 8, height: 6},
    autoClear: true,
    autoClearColor: true,
    setRenderTarget(value: THREE.RenderTarget | null) {
      target = value;
    },
    clear() {},
    clearDepth() {},
    render(object: THREE.Object3D, camera: THREE.Camera) {
      draws.push({object, camera, target});
    },
  };
  return {renderer, draws, target: () => target};
}

describe.each([
  ['WebGL', false],
  ['WebGPU', true],
] as const)('%s compositing', (_, webgpu) => {
  it('composites the current main texture after resize and frees owned targets', async () => {
    const {renderer, draws, target} = rendererBoundary(webgpu);
    const simulatorScene = new THREE.Scene();
    const mainScene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera();
    const compositor = await createSimulatorCompositor(
      {
        renderer: renderer as never,
        simulatorScene,
        renderMainScene: (view) => {
          renderer.render(mainScene, view!);
        },
        registry: new Registry(),
        stencil: true,
        blendingMode: 'normal',
      },
      true
    );
    const video = new THREE.Texture();
    const videoDisposals: string[] = [];
    video.addEventListener('dispose', () => {
      videoDisposals.push('disposed');
    });
    compositor.setBackgroundVideo(video);
    const frame = () => {
      draws.length = 0;
      compositor.renderFrame(camera, camera);
      const main = draws.find((draw) => draw.object === mainScene)!;
      const room = draws.find((draw) => draw.object === simulatorScene)!;
      expect(main.camera).toBe(camera);
      expect(room.camera).toBe(camera);
      expect(room.target).toBeNull();
      expect(target()).toBeNull();
      const composite = draws.find(
        (draw) =>
          (draw.object as THREE.Mesh).material &&
          ((draw.object as THREE.Mesh).material as THREE.MeshBasicMaterial)
            .map === main.target?.texture
      );
      expect(composite?.target).toBeNull();
      expect(main.target?.width).toBe(renderer.domElement.width);
      expect(main.target?.height).toBe(renderer.domElement.height);
      expect(main.target?.stencilBuffer).toBe(true);
      return main.target!;
    };
    try {
      const first = frame();
      let firstReleased = false;
      first.addEventListener('dispose', () => {
        firstReleased = true;
      });
      renderer.domElement.width = 12;
      renderer.domElement.height = 4;
      const resized = frame();
      expect(firstReleased).toBe(true);
      let resizedReleased = false;
      resized.addEventListener('dispose', () => {
        resizedReleased = true;
      });
      compositor.dispose();
      expect(resizedReleased).toBe(true);
      expect(renderer.autoClearColor).toBe(true);
      expect(videoDisposals).toEqual([]);
    } finally {
      compositor.dispose();
      video.dispose();
    }
  });

  it('restores borrowed renderer state when direct rendering fails', async () => {
    const {renderer, draws} = rendererBoundary(webgpu);
    const simulatorScene = new THREE.Scene();
    const failure = new Error('render failed');
    const compositor = await createSimulatorCompositor(
      {
        renderer: renderer as never,
        simulatorScene,
        renderMainScene: () => {
          expect(renderer.autoClear).toBe(false);
          throw failure;
        },
        registry: new Registry(),
        stencil: false,
        blendingMode: 'normal',
      },
      false
    );
    try {
      const camera = new THREE.PerspectiveCamera();
      expect(() => compositor.renderFrame(camera, camera)).toThrow(failure);
      expect(
        draws.some(
          (draw) =>
            draw.object === simulatorScene &&
            draw.camera === camera &&
            draw.target === null
        )
      ).toBe(true);
      expect(renderer.autoClear).toBe(true);
    } finally {
      compositor.dispose();
    }
    expect(renderer.autoClearColor).toBe(true);
  });
});
