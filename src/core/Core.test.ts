import * as THREE from 'three';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';
import {Core} from './Core';
import {Options} from './Options';
import {Script} from './Script';
import {RendererHolder} from './RendererTypes';
import {installAudioBoundary, rendererBoundary} from './Renderer.test-fixture';

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
    controller.dispatchEvent({
      type: 'connected',
      data: {
        handedness: 'left',
        targetRayMode: 'tracked-pointer',
        profiles: ['generic-trigger'],
      },
    });
    controller.userData.lastIntersection = {
      object: target,
      point: new THREE.Vector3(0, 0, -1),
      distance: 1,
    };
    controller.dispatchEvent({type: 'selectstart'});
    output.frame(1000);
    controller.dispatchEvent({type: 'selectend'});
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
    const rapier = await import('@dimforge/rapier3d-simd-compat/rapier.es.js');
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
