import * as THREE from 'three';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {Core} from './Core';
import {Options} from './Options';
import {Script} from './Script';
import {installAudioBoundary} from './Renderer.test-fixture';

const native = vi.hoisted(() => ({
  initialize: async () => {},
  outputs: [] as Array<{state: {loop: unknown; disposed: boolean}}>,
}));
vi.mock('three/webgpu', async (importOriginal) => {
  const original = await importOriginal<typeof import('three/webgpu')>();
  const {rendererBoundary} = await import('./Renderer.test-fixture');
  return {
    ...original,
    WebGPURenderer: class {
      constructor({forceWebGL}: {forceWebGL: boolean}) {
        const output = rendererBoundary();
        native.outputs.push(output);
        Object.assign(this, output.renderer, {
          domElement: document.createElement('canvas'),
          isSplitEngineSerializer: false,
          isWebGPURenderer: true,
          backend: forceWebGL
            ? {isWebGLBackend: true}
            : {isWebGPUBackend: true},
        });
      }
      init() {
        return native.initialize();
      }
    },
  };
});

let core: Core;
let ready: PromiseWithResolvers<void>;
let started: PromiseWithResolvers<void>;
beforeEach(() => {
  installAudioBoundary();
  native.outputs.length = 0;
  ready = Promise.withResolvers<void>();
  started = Promise.withResolvers<void>();
  native.initialize = async () => {
    started.resolve();
    await ready.promise;
  };
  vi.stubGlobal('navigator', {
    ...navigator,
    xr: {isSessionSupported: async () => true},
  });
});
afterEach(async () => {
  ready.resolve();
  try {
    if (core?.lifecycle !== 'disposed') await core?.dispose();
  } finally {
    Core.instance = undefined;
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});

function options() {
  const result = new Options().enableWebGPU();
  result.xrButton.enabled = false;
  return result;
}

describe('Core native renderer readiness', () => {
  it('keeps startup pending until GPU initialization finishes and only then initializes apps', async () => {
    const observed: boolean[] = [];
    let rendererReady = false;
    native.initialize = async () => {
      started.resolve();
      await ready.promise;
      rendererReady = true;
    };
    class App extends Script {
      init() {
        observed.push(rendererReady);
      }
    }
    core = new Core();
    core.scene.add(new App());
    const initialization = core.init(options());
    await started.promise;
    await vi.dynamicImportSettled();
    expect(core.lifecycle).toBe('initializing');
    expect(observed).toEqual([]);
    expect(native.outputs[0].state.loop).toBeNull();
    ready.resolve();
    await initialization;
    expect(observed).toEqual([true]);
    expect(core.lifecycle).toBe('running');
  });

  it('releases a renderer whose native initialization fails', async () => {
    native.initialize = async () => {
      throw new Error('GPU initialization failed');
    };
    core = new Core();
    await expect(core.init(options())).rejects.toThrow(
      'GPU initialization failed'
    );
    expect(core.lifecycle).toBe('disposed');
    expect(native.outputs[0].state.disposed).toBe(true);
    expect(native.outputs[0].state.loop).toBeNull();
  });

  it('rejects an app that requires the incompatible WebGL renderer', async () => {
    core = new Core();
    ready.resolve();
    await core.init(options());
    class WebGLApp extends Script {
      static dependencies = {renderer: THREE.WebGLRenderer};
    }
    vi.spyOn(console, 'error').mockImplementation(() => {});
    await expect(
      core.scriptsManager.initScript(new WebGLApp())
    ).rejects.toThrow(/WebGLRenderer/);
  });

  it.each([false, true])(
    'requests required XR capabilities through the actual session manager (native GPU XR=%s)',
    async (gpuXR) => {
      if (gpuXR) vi.stubGlobal('XRGPUBinding', class {});
      const session = Object.assign(new EventTarget(), {
        requestReferenceSpace: async () => ({}),
        end: async () => session.dispatchEvent(new Event('end')),
      }) as unknown as XRSession;
      const requestSession = vi.fn(async () => session);
      vi.stubGlobal('navigator', {
        ...navigator,
        xr: {isSessionSupported: async () => true, requestSession},
      });
      core = new Core();
      const configuration = options().enableHands();
      configuration.webxrRequiredFeatures = ['hand-tracking', 'local-floor'];
      ready.resolve();
      await core.init(configuration);
      core.webXRSessionManager!.startSession();
      await vi.waitFor(() =>
        expect(core.webXRSessionManager!.currentSession).toBe(session)
      );
      const request = requestSession.mock.calls[0] as unknown as [
        string,
        XRSessionInit,
      ];
      expect(request[1].requiredFeatures).toEqual(
        expect.arrayContaining(['hand-tracking', 'local-floor'])
      );
      expect(request[1].optionalFeatures?.includes('webgpu')).toBe(gpuXR);
    }
  );
});
