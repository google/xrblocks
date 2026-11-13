import * as THREE from 'three';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {Core} from './Core';
import {Options} from './Options';
import {Script} from './Script';
import {RendererHolder} from './RendererTypes';
import type {SerializerRenderer} from './SerializerTypes';

const native = vi.hoisted(() => ({
  initialize: async () => {},
  outputs: [] as Array<{state: {loop: unknown; disposed: boolean}}>,
}));
vi.mock('three/webgpu', async (importOriginal) => {
  const original = await importOriginal<typeof import('three/webgpu')>();
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

/** Native output boundary only: no SDK lifecycle, input, or rendering logic. */
function rendererBoundary() {
  const spaces = new Map<string, THREE.Group>();
  const space = (name: string) => {
    if (!spaces.has(name)) spaces.set(name, new THREE.Group());
    return spaces.get(name)!;
  };
  const camera = new THREE.ArrayCamera([
    new THREE.PerspectiveCamera(),
    new THREE.PerspectiveCamera(),
  ]);
  const state = {
    loop: null as ((time: number, frame?: XRFrame) => void) | null,
    disposed: false,
    frames: 0,
  };
  const xr = Object.assign(new THREE.EventDispatcher(), {
    enabled: false,
    isPresenting: false,
    getController: (index: number) =>
      space(`ray${index}`) as THREE.XRTargetRaySpace,
    getControllerGrip: (index: number) =>
      space(`grip${index}`) as THREE.XRGripSpace,
    getHand: (index: number) =>
      Object.assign(space(`hand${index}`), {joints: {}}),
    getCamera: () => camera,
    updateCamera: (_camera: THREE.Camera) => {},
    setReferenceSpaceType: () => {},
    setFramebufferScaleFactor: () => {},
    setSession: async () => {},
    getSession: () => null,
    getReferenceSpace: () => null,
  });
  const renderer = {
    isSplitEngineSerializer: true,
    xr,
    render: (_scene: THREE.Object3D, _camera: THREE.Camera) => {
      state.frames++;
    },
    setSize: () => {},
    getSize: () => ({width: 8, height: 4}),
    setPixelRatio: () => {},
    getPixelRatio: () => 1,
    setAnimationLoop: (loop: typeof state.loop) => {
      state.loop = loop;
    },
    dispose: () => {
      state.disposed = true;
      state.loop = null;
    },
  } as unknown as SerializerRenderer;
  return {renderer, xr, state, frame: (time: number) => state.loop?.(time)};
}

/** Supply the audio hardware calls Three.js needs while updating real objects. */
function installAudioBoundary() {
  const param = {linearRampToValueAtTime() {}};
  THREE.AudioContext.setContext({
    createGain: () => ({connect() {}}),
    destination: {},
    listener: Object.fromEntries(
      [
        'positionX',
        'positionY',
        'positionZ',
        'forwardX',
        'forwardY',
        'forwardZ',
        'upX',
        'upY',
        'upZ',
      ].map((name) => [name, param])
    ),
  } as unknown as AudioContext);
}

let core: Core;
const release: Array<() => void> = [];
beforeEach(() => {
  installAudioBoundary();
});
afterEach(async () => {
  for (const resolve of release.splice(0)) resolve();
  try {
    if (core?.lifecycle !== 'disposed') await core?.dispose();
  } finally {
    Core.instance = undefined;
    vi.useRealTimers();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  }
});

function gate() {
  const pending = Promise.withResolvers<void>();
  release.push(() => pending.resolve());
  return pending;
}

function runtimeLoader(initialization = Promise.resolve()) {
  // A loaded script's completion is controlled; Core and ScriptsManager remain real.
  const state = {
    starts: 0,
    disposed: false,
    runtime: undefined as Script | undefined,
  };
  class Runtime extends Script {
    async init() {
      state.runtime = this;
      state.starts++;
      await initialization;
    }
    dispose() {
      state.disposed = true;
    }
  }
  const load = vi.fn(
    async () =>
      ({
        Simulator: Runtime,
      }) as unknown as typeof import('../simulator/Simulator')
  );
  return {load, state};
}

describe('Core lifetime through its actual startup path', () => {
  it('shares startup, waits for actual script initialization and rejects reuse after disposal', async () => {
    const ready = gate();
    const output = rendererBoundary();
    let initialized = 0;
    let disposed = 0;
    class App extends Script {
      async init() {
        initialized++;
        await ready.promise;
      }
      dispose() {
        disposed++;
      }
    }
    core = new Core();
    core.scene.add(new App());
    const options = new Options().enableSerializer(output.renderer);
    const first = core.init(options);
    const second = core.init(options);
    let finished = false;
    void first.then(() => {
      finished = true;
    });
    await vi.waitFor(() => expect(initialized).toBe(1));
    expect(finished).toBe(false);
    expect(core.lifecycle).toBe('initializing');
    expect(output.state.loop).toBeNull();
    ready.resolve();
    await Promise.all([first, second]);
    expect(core.lifecycle).toBe('running');
    await Promise.all([core.dispose(), core.dispose()]);
    expect(disposed).toBe(1);
    expect(output.state.disposed).toBe(true);
    await expect(core.init(options)).rejects.toThrow(/dispos/);
  });

  it('cancels a pending script generation without starting a frame loop', async () => {
    const ready = gate();
    const started = gate();
    const output = rendererBoundary();
    let disposed = false;
    class App extends Script {
      async init() {
        started.resolve();
        await ready.promise;
      }
      dispose() {
        disposed = true;
      }
    }
    core = new Core();
    core.scene.add(new App());
    const initialization = core.init(
      new Options().enableSerializer(output.renderer)
    );
    const stopped = expect(initialization).rejects.toThrow(/dispos/);
    await started.promise;
    const disposal = core.dispose();
    ready.resolve();
    await Promise.all([stopped, disposal]);
    expect(core.lifecycle).toBe('disposed');
    expect(disposed).toBe(true);
    expect(output.state.disposed).toBe(true);
    expect(output.state.loop).toBeNull();
  });

  it('runs real script updates with the current headset pose and stops producing frames after disposal', async () => {
    const output = rendererBoundary();
    output.xr.isPresenting = true;
    output.xr.updateCamera = (camera) => {
      camera.position.set(0.4, 1.65, -0.2);
    };
    const observations: number[][] = [];
    class App extends Script {
      static dependencies = {renderer: RendererHolder};
      init({renderer}: {renderer: RendererHolder}) {
        expect(renderer.renderer).toBe(output.renderer);
      }
      update() {
        observations.push(core.camera.position.toArray());
        this.position.x++;
      }
    }
    core = new Core();
    const app = new App();
    core.scene.add(app);
    await core.init(new Options().enableSerializer(output.renderer));
    output.frame(1000);
    expect(observations).toEqual([[0.4, 1.65, -0.2]]);
    expect(app.position.x).toBe(1);
    expect(output.state.frames).toBe(1);
    await core.dispose();
    output.frame(2000);
    expect(app.position.x).toBe(1);
    expect(output.state.frames).toBe(1);
  });

  it('routes a serializer controller press to the real target callback', async () => {
    const output = rendererBoundary();
    let selected = 0;
    class Target extends Script {
      onObjectSelectEnd() {
        selected++;
      }
    }
    const target = new Target();
    core = new Core();
    core.scene.add(target);
    await core.init(new Options().enableSerializer(output.renderer));
    const controller = output.xr.getController(0);
    const source: XRInputSource = {
      targetRaySpace: {} as XRSpace,
      handedness: 'left',
      targetRayMode: 'tracked-pointer',
      profiles: ['generic-trigger'],
    };
    controller.dispatchEvent({type: 'connected', data: source});
    controller.userData.lastIntersection = {
      object: target,
      point: new THREE.Vector3(0, 0, -1),
      distance: 1,
    };
    controller.dispatchEvent({type: 'selectstart', data: source});
    output.frame(1000);
    controller.dispatchEvent({type: 'selectend', data: source});
    output.frame(1016);
    expect(selected).toBe(1);
  });

  it('continues releasing resources after a script cleanup fails', async () => {
    const output = rendererBoundary();
    let siblingDisposed = false;
    class Broken extends Script {
      dispose() {
        throw new Error('App cleanup failed');
      }
    }
    class Sibling extends Script {
      dispose() {
        siblingDisposed = true;
      }
    }
    core = new Core();
    core.scene.add(new Broken(), new Sibling());
    const options = new Options().enableSerializer(output.renderer);
    options.catchScriptExceptions = false;
    await core.init(options);
    await expect(core.dispose()).rejects.toThrow('App cleanup failed');
    expect(siblingDisposed).toBe(true);
    expect(output.state.disposed).toBe(true);
    expect(core.lifecycle).toBe('disposed');
  });

  it('stops the real physics interval before releasing its world', async () => {
    const modulePath = '@dimforge/rapier3d-simd-compat/rapier.es.js';
    const rapier: typeof import('@dimforge/rapier3d-simd-compat') =
      await import(modulePath);
    vi.useFakeTimers();
    const output = rendererBoundary();
    core = new Core();
    const options = new Options().enableSerializer(output.renderer);
    options.physics.RAPIER = rapier;
    await core.init(options);
    const body = core.physics!.blendedWorld.createRigidBody(
      rapier.RigidBodyDesc.dynamic().setTranslation(0, 2, 0)
    );
    core.physics!.blendedWorld.createCollider(
      rapier.ColliderDesc.ball(0.1),
      body
    );
    vi.advanceTimersByTime(100);
    expect(body.translation().y).toBeLessThan(2);
    await core.dispose();
    expect(() => vi.advanceTimersByTime(100)).not.toThrow();
    expect(output.state.disposed).toBe(true);
  });
});

describe('Core runtime loading', () => {
  it('shares an in-flight runtime and publishes it only after its script is ready', async () => {
    const ready = gate();
    const runtime = runtimeLoader(ready.promise);
    const output = rendererBoundary();
    core = new Core(runtime.load);
    await core.init(new Options().enableSerializer(output.renderer));
    const first = core.startSimulator();
    const second = core.startSimulator();
    await vi.waitFor(() => expect(runtime.state.starts).toBe(1));
    expect(core.simulatorRunning).toBe(false);
    expect(core.simulator).toBeUndefined();
    ready.resolve();
    const [a, b] = await Promise.all([first, second]);
    expect(a).toBe(b);
    expect(core.simulator).toBe(runtime.state.runtime);
    expect(core.simulatorRunning).toBe(true);
    await expect(core.startSimulator()).resolves.toBe(a);
    expect(runtime.state.starts).toBe(1);
    await core.dispose();
    expect(runtime.state.disposed).toBe(true);
  });

  it.each(['load', 'initialize'] as const)(
    'can retry a runtime %s failure without retaining a partial runtime',
    async (stage) => {
      const error = new Error('Runtime unavailable');
      const ready = gate();
      const runtime = runtimeLoader(
        stage === 'initialize' ? ready.promise : Promise.resolve()
      );
      if (stage === 'load') runtime.load.mockRejectedValueOnce(error);
      core = new Core(runtime.load);
      await core.init(
        new Options().enableSerializer(rendererBoundary().renderer)
      );
      const startup = core.startSimulator();
      const failed = expect(startup).rejects.toBe(error);
      if (stage === 'initialize') {
        await vi.waitFor(() => expect(runtime.state.starts).toBe(1));
        ready.reject(error);
      }
      await failed;
      expect(core.simulator).toBeUndefined();
      expect(core.simulatorRunning).toBe(false);
      if (runtime.state.runtime)
        expect(runtime.state.runtime.parent).toBeNull();
      const retry = runtimeLoader();
      runtime.load.mockImplementation(retry.load);
      await core.startSimulator();
      expect(core.simulatorRunning).toBe(true);
    }
  );

  it.each(['load', 'initialize'] as const)(
    'does not adopt a runtime that completes %s after disposal starts',
    async (stage) => {
      const ready = gate();
      const loaded =
        Promise.withResolvers<
          Awaited<ReturnType<ReturnType<typeof runtimeLoader>['load']>>
        >();
      const runtime = runtimeLoader(
        stage === 'initialize' ? ready.promise : Promise.resolve()
      );
      const module = await runtime.load();
      runtime.load.mockReturnValue(loaded.promise);
      release.push(() => loaded.resolve(module));
      core = new Core(runtime.load);
      await core.init(
        new Options().enableSerializer(rendererBoundary().renderer)
      );
      const startup = core.startSimulator();
      const stopped = expect(startup).rejects.toThrow(/dispos/);
      if (stage === 'initialize') {
        loaded.resolve(module);
        await vi.waitFor(() => expect(runtime.state.starts).toBe(1));
      }
      const disposal = core.dispose();
      loaded.resolve(module);
      ready.resolve();
      await Promise.all([stopped, disposal]);
      expect(core.simulator).toBeUndefined();
      expect(core.simulatorRunning).toBe(false);
      expect(runtime.state.runtime?.parent ?? null).toBeNull();
      expect(runtime.state.disposed).toBe(stage === 'initialize');
    }
  );
});

describe('Core native renderer readiness', () => {
  let ready: PromiseWithResolvers<void>;
  let started: PromiseWithResolvers<void>;
  beforeEach(() => {
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
  afterEach(() => {
    ready.resolve();
  });

  function options() {
    const result = new Options().enableWebGPU();
    result.xrButton.enabled = false;
    return result;
  }

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
