import * as THREE from 'three';
import {MeshBasicNodeMaterial, NodeMaterial, QuadMesh} from 'three/webgpu';
import {afterEach, describe, expect, it, vi} from 'vitest';

import {Registry} from '../../../core/components/Registry';
import {SparkRendererHolder} from '../../../utils/SparkRendererHolder';
import type {SimulatorCamera} from '../../SimulatorCamera';
import {
  createSimulatorCompositor,
  type SimulatorCompositorDeps,
  WebGLDirectCompositor,
  WebGLRenderTargetCompositor,
} from './SimulatorCompositor';
import {WebGPUDirectCompositor} from './WebGPUDirectCompositor';
import {WebGPURenderTargetCompositor} from './WebGPURenderTargetCompositor';

function createFakeRenderer(options?: {
  isWebGPURenderer?: boolean;
  width?: number;
  height?: number;
  autoClear?: boolean;
  autoClearColor?: boolean;
}) {
  return {
    isWebGPURenderer: options?.isWebGPURenderer ?? false,
    domElement: {
      width: options?.width ?? 800,
      height: options?.height ?? 600,
    },
    autoClear: options?.autoClear ?? true,
    autoClearColor: options?.autoClearColor ?? true,
    setRenderTarget: vi.fn(),
    clear: vi.fn(),
    clearDepth: vi.fn(),
    render: vi.fn(),
  };
}

function createFakeDeps(
  overrides?: Partial<SimulatorCompositorDeps> & {
    isWebGPURenderer?: boolean;
    width?: number;
    height?: number;
  }
): SimulatorCompositorDeps {
  const renderer =
    overrides?.renderer ??
    (createFakeRenderer({
      isWebGPURenderer: overrides?.isWebGPURenderer,
      width: overrides?.width,
      height: overrides?.height,
    }) as never);
  const registry = overrides?.registry ?? new Registry();
  const simulatorScene = overrides?.simulatorScene ?? new THREE.Scene();
  const renderMainScene = overrides?.renderMainScene ?? vi.fn();

  return {
    renderer,
    simulatorScene,
    renderMainScene,
    registry,
    simulatorCamera: overrides?.simulatorCamera,
    stencil: overrides?.stencil ?? false,
    blendingMode: overrides?.blendingMode ?? 'normal',
  };
}

describe('SimulatorCompositor', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('createSimulatorCompositor factory', () => {
    it('returns WebGLRenderTargetCompositor when WebGL renderer and renderToRenderTexture is true', async () => {
      const deps = createFakeDeps({isWebGPURenderer: false});
      const compositor = await createSimulatorCompositor(deps, true);
      expect(compositor).toBeInstanceOf(WebGLRenderTargetCompositor);
    });

    it('returns WebGLDirectCompositor when WebGL renderer and renderToRenderTexture is false', async () => {
      const deps = createFakeDeps({isWebGPURenderer: false});
      const compositor = await createSimulatorCompositor(deps, false);
      expect(compositor).toBeInstanceOf(WebGLDirectCompositor);
      expect(compositor).not.toBeInstanceOf(WebGPURenderTargetCompositor);
    });

    it('returns WebGPURenderTargetCompositor when WebGPU renderer and renderToRenderTexture is true', async () => {
      const deps = createFakeDeps({isWebGPURenderer: true});
      const compositor = await createSimulatorCompositor(deps, true);
      expect(compositor).toBeInstanceOf(WebGPURenderTargetCompositor);
    });

    it('returns WebGPUDirectCompositor when WebGPU renderer and renderToRenderTexture is false', async () => {
      const deps = createFakeDeps({isWebGPURenderer: true});
      const compositor = await createSimulatorCompositor(deps, false);
      expect(compositor).toBeInstanceOf(WebGPUDirectCompositor);
      expect(compositor).toBeInstanceOf(WebGLDirectCompositor);
      expect(compositor).not.toBeInstanceOf(WebGPURenderTargetCompositor);
    });
  });

  describe('WebGLRenderTargetCompositor call ordering', () => {
    it('executes virtual pass, simulator camera hooks, simulator scene pass, and fullscreen quad composite in exact order', () => {
      const calls: string[] = [];
      let sparkEncodeLinear = false;
      const fakeSparkRenderer = {
        get encodeLinear() {
          return sparkEncodeLinear;
        },
        set encodeLinear(value: boolean) {
          sparkEncodeLinear = value;
          calls.push(`spark.encodeLinear = ${value}`);
        },
      };

      const registry = new Registry();
      registry.register(new SparkRendererHolder(fakeSparkRenderer as never));

      const simulatorScene = new THREE.Scene();
      const fakeRenderer = createFakeRenderer({width: 800, height: 600});
      fakeRenderer.setRenderTarget.mockImplementation((target: unknown) => {
        calls.push(target ? 'setRenderTarget(rt)' : 'setRenderTarget(null)');
      });
      fakeRenderer.clear.mockImplementation(() => {
        calls.push('renderer.clear');
      });
      fakeRenderer.render.mockImplementation((scene: unknown) => {
        if (scene === simulatorScene) {
          calls.push('renderer.render(simulatorScene)');
        }
      });
      fakeRenderer.clearDepth.mockImplementation(() => {
        calls.push('renderer.clearDepth');
      });

      const renderMainScene = vi.fn(() => {
        calls.push('renderMainScene');
      });

      const simulatorCamera = {
        onBeforeSimulatorSceneRender: vi.fn(() => {
          calls.push('onBeforeSimulatorSceneRender');
        }),
        onSimulatorSceneRendered: vi.fn(() => {
          calls.push('onSimulatorSceneRendered');
        }),
      } as unknown as SimulatorCamera;

      const deps = createFakeDeps({
        renderer: fakeRenderer as never,
        simulatorScene,
        renderMainScene,
        registry,
        simulatorCamera,
      });

      const compositor = new WebGLRenderTargetCompositor(deps);
      const videoTexture = new THREE.Texture();
      compositor.setBackgroundVideo(videoTexture);

      const backgroundVideoQuad = (
        compositor as unknown as {
          backgroundVideoQuad: {render: (renderer: unknown) => void};
        }
      ).backgroundVideoQuad;
      vi.spyOn(backgroundVideoQuad, 'render').mockImplementation(() => {
        calls.push('backgroundVideoQuad.render');
      });

      vi.spyOn(
        compositor.virtualSceneFullScreenQuad,
        'render'
      ).mockImplementation(() => {
        calls.push('virtualSceneFullScreenQuad.render');
      });

      const renderCamera = new THREE.PerspectiveCamera();
      const mainCamera = new THREE.PerspectiveCamera();

      compositor.renderFrame(renderCamera, mainCamera);

      expect(calls).toEqual([
        'spark.encodeLinear = true',
        'setRenderTarget(rt)',
        'renderer.clear',
        'renderMainScene',
        'onBeforeSimulatorSceneRender',
        'spark.encodeLinear = false',
        'setRenderTarget(null)',
        'backgroundVideoQuad.render',
        'renderer.render(simulatorScene)',
        'renderer.clearDepth',
        'onSimulatorSceneRendered',
        'virtualSceneFullScreenQuad.render',
      ]);

      expect(fakeRenderer.setRenderTarget).toHaveBeenNthCalledWith(
        1,
        compositor.virtualSceneRenderTarget
      );
      expect(fakeRenderer.setRenderTarget).toHaveBeenNthCalledWith(2, null);
      expect(renderMainScene).toHaveBeenCalledWith(renderCamera);
      expect(simulatorCamera.onBeforeSimulatorSceneRender).toHaveBeenCalledWith(
        mainCamera,
        expect.any(Function)
      );
      expect(fakeRenderer.render).toHaveBeenCalledWith(
        simulatorScene,
        renderCamera
      );
      expect(compositor.virtualSceneFullScreenQuad.render).toHaveBeenCalledWith(
        fakeRenderer
      );
    });
  });

  describe('Render-target reallocation & stencil preservation', () => {
    it.each([true, false])(
      'disposes old render target, reallocates with stencilBuffer: %s, and updates material map when dimensions change',
      (stencil) => {
        const fakeRenderer = createFakeRenderer({width: 800, height: 600});
        const deps = createFakeDeps({
          renderer: fakeRenderer as never,
          stencil,
        });

        const compositor = new WebGLRenderTargetCompositor(deps);
        const initialRenderTarget = compositor.virtualSceneRenderTarget;
        expect(initialRenderTarget.stencilBuffer).toBe(stencil);

        const disposeSpy = vi.spyOn(initialRenderTarget, 'dispose');
        const renderCamera = new THREE.PerspectiveCamera();
        const mainCamera = new THREE.PerspectiveCamera();

        // First frame with unchanged dimensions does not reallocate.
        compositor.renderFrame(renderCamera, mainCamera);
        expect(disposeSpy).not.toHaveBeenCalled();
        expect(compositor.virtualSceneRenderTarget).toBe(initialRenderTarget);

        // Resize width and height.
        fakeRenderer.domElement.width = 1280;
        fakeRenderer.domElement.height = 720;

        compositor.renderFrame(renderCamera, mainCamera);

        expect(disposeSpy).toHaveBeenCalledOnce();
        const newRenderTarget = compositor.virtualSceneRenderTarget;
        expect(newRenderTarget).not.toBe(initialRenderTarget);
        expect(newRenderTarget.width).toBe(1280);
        expect(newRenderTarget.height).toBe(720);
        expect(newRenderTarget.stencilBuffer).toBe(stencil);

        const quadMaterial = compositor.virtualSceneFullScreenQuad
          .material as THREE.MeshBasicMaterial;
        expect(quadMaterial.map).toBe(newRenderTarget.texture);
      }
    );
  });

  describe('Screen blending mode', () => {
    it('configures custom screen blending parameters when blendingMode is screen', () => {
      const deps = createFakeDeps({blendingMode: 'screen'});
      const compositor = new WebGLRenderTargetCompositor(deps);
      const material = compositor.virtualSceneFullScreenQuad
        .material as THREE.MeshBasicMaterial;

      expect(material.transparent).toBe(true);
      expect(material.blending).toBe(THREE.CustomBlending);
      expect(material.blendSrc).toBe(THREE.OneFactor);
      expect(material.blendDst).toBe(THREE.OneMinusSrcColorFactor);
      expect(material.blendEquation).toBe(THREE.AddEquation);
    });

    it('uses default normal blending when blendingMode is normal', () => {
      const deps = createFakeDeps({blendingMode: 'normal'});
      const compositor = new WebGLRenderTargetCompositor(deps);
      const material = compositor.virtualSceneFullScreenQuad
        .material as THREE.MeshBasicMaterial;

      expect(material.transparent).toBe(true);
      expect(material.blending).toBe(THREE.NormalBlending);
    });
  });

  describe('WebGLDirectCompositor call order & try/finally autoClear restoration', () => {
    it('renders simulator scene pass first, disables autoClear during renderMainScene, and restores autoClear after', () => {
      const calls: string[] = [];
      const simulatorScene = new THREE.Scene();
      const fakeRenderer = createFakeRenderer({autoClear: true});

      fakeRenderer.setRenderTarget.mockImplementation((target: unknown) => {
        calls.push(target ? 'setRenderTarget(rt)' : 'setRenderTarget(null)');
      });
      fakeRenderer.render.mockImplementation((scene: unknown) => {
        if (scene === simulatorScene) {
          calls.push('renderer.render(simulatorScene)');
        }
      });
      fakeRenderer.clearDepth.mockImplementation(() => {
        calls.push('renderer.clearDepth');
      });

      let autoClearDuringMainScene: boolean | undefined;
      const renderMainScene = vi.fn(() => {
        autoClearDuringMainScene = fakeRenderer.autoClear;
        calls.push('renderMainScene');
      });

      const simulatorCamera = {
        onBeforeSimulatorSceneRender: vi.fn(() => {
          calls.push('onBeforeSimulatorSceneRender');
        }),
        onSimulatorSceneRendered: vi.fn(() => {
          calls.push('onSimulatorSceneRendered');
        }),
      } as unknown as SimulatorCamera;

      const deps = createFakeDeps({
        renderer: fakeRenderer as never,
        simulatorScene,
        renderMainScene,
        simulatorCamera,
      });

      const compositor = new WebGLDirectCompositor(deps);
      const renderCamera = new THREE.PerspectiveCamera();
      const mainCamera = new THREE.PerspectiveCamera();

      compositor.renderFrame(renderCamera, mainCamera);

      expect(calls).toEqual([
        'onBeforeSimulatorSceneRender',
        'setRenderTarget(null)',
        'renderer.render(simulatorScene)',
        'renderer.clearDepth',
        'onSimulatorSceneRendered',
        'renderMainScene',
      ]);
      expect(autoClearDuringMainScene).toBe(false);
      expect(fakeRenderer.autoClear).toBe(true);
    });

    it('restores renderer.autoClear to its prior value and propagates error if renderMainScene throws', () => {
      const fakeRenderer = createFakeRenderer({autoClear: true});
      const renderError = new Error('renderMainScene failure');
      const renderMainScene = vi.fn(() => {
        expect(fakeRenderer.autoClear).toBe(false);
        throw renderError;
      });

      const deps = createFakeDeps({
        renderer: fakeRenderer as never,
        renderMainScene,
      });

      const compositor = new WebGLDirectCompositor(deps);
      const renderCamera = new THREE.PerspectiveCamera();
      const mainCamera = new THREE.PerspectiveCamera();

      expect(() => compositor.renderFrame(renderCamera, mainCamera)).toThrow(
        renderError
      );
      expect(fakeRenderer.autoClear).toBe(true);
    });
  });

  describe('autoClearColor snapshot & restore on dispose()', () => {
    it.each([
      ['WebGLRenderTargetCompositor', true, false],
      ['WebGLDirectCompositor', false, false],
      ['WebGPURenderTargetCompositor', true, true],
      ['WebGPUDirectCompositor', false, true],
    ])(
      'sets renderer.autoClearColor = false on construction and restores prior value on dispose() for %s',
      async (_name, renderToRenderTexture, isWebGPURenderer) => {
        const fakeRenderer = createFakeRenderer({
          isWebGPURenderer,
          autoClearColor: true,
        });
        const deps = createFakeDeps({
          renderer: fakeRenderer as never,
        });

        expect(fakeRenderer.autoClearColor).toBe(true);
        const compositor = await createSimulatorCompositor(
          deps,
          renderToRenderTexture
        );
        expect(fakeRenderer.autoClearColor).toBe(false);

        compositor.dispose();
        expect(fakeRenderer.autoClearColor).toBe(true);
      }
    );
  });

  describe('WebGPURenderTargetCompositor', () => {
    it('executes virtual pass, simulator camera hooks, simulator scene pass, and fullscreen QuadMesh composite in exact order', () => {
      const calls: string[] = [];
      let sparkEncodeLinear = false;
      const fakeSparkRenderer = {
        get encodeLinear() {
          return sparkEncodeLinear;
        },
        set encodeLinear(value: boolean) {
          sparkEncodeLinear = value;
          calls.push(`spark.encodeLinear = ${value}`);
        },
      };

      const registry = new Registry();
      registry.register(new SparkRendererHolder(fakeSparkRenderer as never));

      const simulatorScene = new THREE.Scene();
      const fakeRenderer = createFakeRenderer({
        isWebGPURenderer: true,
        width: 800,
        height: 600,
      });
      fakeRenderer.setRenderTarget.mockImplementation((target: unknown) => {
        calls.push(target ? 'setRenderTarget(rt)' : 'setRenderTarget(null)');
      });
      fakeRenderer.clear.mockImplementation(() => {
        calls.push('renderer.clear');
      });
      fakeRenderer.render.mockImplementation((scene: unknown) => {
        if (scene === simulatorScene) {
          calls.push('renderer.render(simulatorScene)');
        }
      });
      fakeRenderer.clearDepth.mockImplementation(() => {
        calls.push('renderer.clearDepth');
      });

      const renderMainScene = vi.fn(() => {
        calls.push('renderMainScene');
      });

      const simulatorCamera = {
        onBeforeSimulatorSceneRender: vi.fn(() => {
          calls.push('onBeforeSimulatorSceneRender');
        }),
        onSimulatorSceneRendered: vi.fn(() => {
          calls.push('onSimulatorSceneRendered');
        }),
      } as unknown as SimulatorCamera;

      const deps = createFakeDeps({
        renderer: fakeRenderer as never,
        simulatorScene,
        renderMainScene,
        registry,
        simulatorCamera,
      });

      const compositor = new WebGPURenderTargetCompositor(deps);
      vi.spyOn(
        compositor.virtualSceneFullScreenQuad,
        'render'
      ).mockImplementation(() => {
        calls.push('virtualSceneFullScreenQuad.render');
      });

      const renderCamera = new THREE.PerspectiveCamera();
      const mainCamera = new THREE.PerspectiveCamera();

      compositor.renderFrame(renderCamera, mainCamera);

      expect(calls).toEqual([
        'spark.encodeLinear = true',
        'setRenderTarget(rt)',
        'renderer.clear',
        'renderMainScene',
        'onBeforeSimulatorSceneRender',
        'spark.encodeLinear = false',
        'setRenderTarget(null)',
        'renderer.clear',
        'renderer.render(simulatorScene)',
        'renderer.clearDepth',
        'onSimulatorSceneRendered',
        'virtualSceneFullScreenQuad.render',
      ]);

      expect(fakeRenderer.setRenderTarget).toHaveBeenNthCalledWith(
        1,
        compositor.virtualSceneRenderTarget
      );
      expect(fakeRenderer.setRenderTarget).toHaveBeenNthCalledWith(2, null);
      expect(renderMainScene).toHaveBeenCalledWith(renderCamera);
      expect(simulatorCamera.onBeforeSimulatorSceneRender).toHaveBeenCalledWith(
        mainCamera,
        expect.any(Function)
      );
      expect(fakeRenderer.render).toHaveBeenCalledWith(
        simulatorScene,
        renderCamera
      );
      expect(compositor.virtualSceneFullScreenQuad.render).toHaveBeenCalledWith(
        fakeRenderer
      );
    });

    it.each([true, false])(
      'disposes old render target, reallocates with stencilBuffer: %s, and updates material map when dimensions change',
      (stencil) => {
        const fakeRenderer = createFakeRenderer({
          isWebGPURenderer: true,
          width: 800,
          height: 600,
        });
        const deps = createFakeDeps({
          renderer: fakeRenderer as never,
          stencil,
        });

        const compositor = new WebGPURenderTargetCompositor(deps);
        const initialRenderTarget = compositor.virtualSceneRenderTarget;
        expect(initialRenderTarget.stencilBuffer).toBe(stencil);

        const disposeSpy = vi.spyOn(initialRenderTarget, 'dispose');
        const renderCamera = new THREE.PerspectiveCamera();
        const mainCamera = new THREE.PerspectiveCamera();

        // First frame with unchanged dimensions does not reallocate.
        compositor.renderFrame(renderCamera, mainCamera);
        expect(disposeSpy).not.toHaveBeenCalled();
        expect(compositor.virtualSceneRenderTarget).toBe(initialRenderTarget);

        // Resize width and height.
        fakeRenderer.domElement.width = 1280;
        fakeRenderer.domElement.height = 720;

        compositor.renderFrame(renderCamera, mainCamera);

        expect(disposeSpy).toHaveBeenCalledOnce();
        const newRenderTarget = compositor.virtualSceneRenderTarget;
        expect(newRenderTarget).not.toBe(initialRenderTarget);
        expect(newRenderTarget.width).toBe(1280);
        expect(newRenderTarget.height).toBe(720);
        expect(newRenderTarget.stencilBuffer).toBe(stencil);

        const quadMaterial = compositor.virtualSceneFullScreenQuad
          .material as MeshBasicNodeMaterial;
        expect(quadMaterial.map).toBe(newRenderTarget.texture);
      }
    );

    it('configures custom screen blending parameters on MeshBasicNodeMaterial when blendingMode is screen', () => {
      const deps = createFakeDeps({
        isWebGPURenderer: true,
        blendingMode: 'screen',
      });
      const compositor = new WebGPURenderTargetCompositor(deps);
      const material = compositor.virtualSceneFullScreenQuad
        .material as MeshBasicNodeMaterial;

      expect(material).toBeInstanceOf(MeshBasicNodeMaterial);
      expect(material.transparent).toBe(true);
      expect(material.blending).toBe(THREE.CustomBlending);
      expect(material.blendSrc).toBe(THREE.OneFactor);
      expect(material.blendDst).toBe(THREE.OneMinusSrcColorFactor);
      expect(material.blendEquation).toBe(THREE.AddEquation);
    });

    it('uses default normal blending on MeshBasicNodeMaterial when blendingMode is normal', () => {
      const deps = createFakeDeps({
        isWebGPURenderer: true,
        blendingMode: 'normal',
      });
      const compositor = new WebGPURenderTargetCompositor(deps);
      const material = compositor.virtualSceneFullScreenQuad
        .material as MeshBasicNodeMaterial;

      expect(material).toBeInstanceOf(MeshBasicNodeMaterial);
      expect(material.transparent).toBe(true);
      expect(material.blending).toBe(THREE.NormalBlending);
    });

    it('renders backgroundVideoQuad (QuadMesh with NodeMaterial) and clears depth instead of full clear during canvas pass', () => {
      const calls: string[] = [];
      const simulatorScene = new THREE.Scene();
      const fakeRenderer = createFakeRenderer({isWebGPURenderer: true});
      fakeRenderer.setRenderTarget.mockImplementation((target: unknown) => {
        calls.push(target ? 'setRenderTarget(rt)' : 'setRenderTarget(null)');
      });
      fakeRenderer.clear.mockImplementation(() => {
        calls.push('renderer.clear');
      });
      fakeRenderer.clearDepth.mockImplementation(() => {
        calls.push('renderer.clearDepth');
      });
      fakeRenderer.render.mockImplementation((scene: unknown) => {
        if (scene === simulatorScene) {
          calls.push('renderer.render(simulatorScene)');
        }
      });

      const renderMainScene = vi.fn(() => {
        calls.push('renderMainScene');
      });

      const deps = createFakeDeps({
        renderer: fakeRenderer as never,
        simulatorScene,
        renderMainScene,
      });

      const compositor = new WebGPURenderTargetCompositor(deps);
      const videoTexture = new THREE.Texture();
      compositor.setBackgroundVideo(videoTexture);

      const backgroundVideoQuad = (
        compositor as unknown as {
          backgroundVideoQuad: QuadMesh;
        }
      ).backgroundVideoQuad;
      expect(backgroundVideoQuad).toBeInstanceOf(QuadMesh);
      expect(backgroundVideoQuad.material).toBeInstanceOf(NodeMaterial);

      vi.spyOn(backgroundVideoQuad, 'render').mockImplementation(() => {
        calls.push('backgroundVideoQuad.render');
      });
      vi.spyOn(
        compositor.virtualSceneFullScreenQuad,
        'render'
      ).mockImplementation(() => {
        calls.push('virtualSceneFullScreenQuad.render');
      });

      const renderCamera = new THREE.PerspectiveCamera();
      const mainCamera = new THREE.PerspectiveCamera();
      compositor.renderFrame(renderCamera, mainCamera);

      expect(calls).toEqual([
        'setRenderTarget(rt)',
        'renderer.clear',
        'renderMainScene',
        'setRenderTarget(null)',
        'backgroundVideoQuad.render',
        'renderer.clearDepth',
        'renderer.render(simulatorScene)',
        'renderer.clearDepth',
        'virtualSceneFullScreenQuad.render',
      ]);
    });
  });

  describe('WebGPUDirectCompositor', () => {
    it('calls renderer.clear() before rendering simulatorScene when no background video is set', () => {
      const calls: string[] = [];
      const simulatorScene = new THREE.Scene();
      const fakeRenderer = createFakeRenderer({isWebGPURenderer: true});

      fakeRenderer.setRenderTarget.mockImplementation(() => {
        calls.push('setRenderTarget(null)');
      });
      fakeRenderer.clear.mockImplementation(() => {
        calls.push('renderer.clear');
      });
      fakeRenderer.render.mockImplementation((scene: unknown) => {
        if (scene === simulatorScene) {
          calls.push('renderer.render(simulatorScene)');
        }
      });
      fakeRenderer.clearDepth.mockImplementation(() => {
        calls.push('renderer.clearDepth');
      });

      const renderMainScene = vi.fn(() => {
        calls.push('renderMainScene');
      });

      const deps = createFakeDeps({
        renderer: fakeRenderer as never,
        simulatorScene,
        renderMainScene,
      });

      const compositor = new WebGPUDirectCompositor(deps);
      const renderCamera = new THREE.PerspectiveCamera();
      const mainCamera = new THREE.PerspectiveCamera();

      compositor.renderFrame(renderCamera, mainCamera);

      expect(calls).toEqual([
        'setRenderTarget(null)',
        'renderer.clear',
        'renderer.render(simulatorScene)',
        'renderer.clearDepth',
        'renderMainScene',
      ]);
    });
  });
});
