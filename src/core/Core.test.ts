import {describe, it, expect, vi, beforeEach, afterEach} from 'vitest';

// Stub AudioContext globally before importing any modules that rely on THREE.AudioListener.
// Use plain JS functions rather than vi.fn() to prevent vi.restoreAllMocks() from clearing the mock implementation.
vi.hoisted(() => {
  vi.stubGlobal('AudioContext', function () {
    return {
      createGain: function () {
        return {
          connect: function () {},
        };
      },
      destination: {},
    };
  });
});

import * as THREE from 'three';
import {Core} from './Core';
import {Options} from './Options';
import {Script} from './Script';
import {
  ScriptsManager,
  ScriptsManagerEventType,
} from './components/ScriptsManager';
import {WebXRSessionManager} from './components/WebXRSessionManager';
import {XRButton} from './components/XRButton';

function scripts(core: Core): ScriptsManager {
  return (core as unknown as {scriptsManager: ScriptsManager}).scriptsManager;
}

type SimulatorLoader = () => Promise<
  typeof import('../simulator/Simulator.js')
>;

describe('Core frame and simulator lifecycle', () => {
  let core: Core;
  const simulatorLoader = vi.fn<SimulatorLoader>();

  beforeEach(async () => {
    await Core.instance?.dispose();
    Core.instance = undefined;
    simulatorLoader.mockReset();
    core = new Core(simulatorLoader);
    core.options = new Options();

    core.renderer = {
      render: vi.fn(),
      xr: {
        enabled: false,
        getDepthSensingMesh: vi.fn(),
        setReferenceSpaceType: vi.fn(),
      },
    } as unknown as THREE.WebGLRenderer;
    core.depth.update = vi.fn();
    core.input.sampleSources = vi.fn();
    scripts(core).syncScriptsWithScene = vi.fn();
    core.waitFrame.onFrame = vi.fn();
    core.screenshotSynthesizer.onAfterRender = vi.fn();
  });

  afterEach(async () => {
    await core.dispose();
    vi.restoreAllMocks();
  });

  it('shares one initialization and treats disposal as terminal', async () => {
    let finishInitialization: (() => void) | undefined;
    vi.spyOn(
      core as unknown as {initialize(options: Options): Promise<void>},
      'initialize'
    ).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishInitialization = resolve;
        })
    );

    const first = core.init(core.options);
    const second = core.init(core.options);
    expect(second).toBe(first);

    await vi.waitFor(() => expect(finishInitialization).toBeDefined());
    finishInitialization?.();
    await first;

    const firstDisposal = core.dispose();
    expect(core.dispose()).toBe(firstDisposal);
    await firstDisposal;
    await expect(core.init(core.options)).rejects.toThrow(
      'Core cannot initialize after disposal has completed.'
    );
  });

  it('stops initialization when disposal starts', async () => {
    let finishInitialization: (() => void) | undefined;
    vi.spyOn(
      core as unknown as {initialize(options: Options): Promise<void>},
      'initialize'
    ).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          finishInitialization = resolve;
        })
    );

    const initialization = core.init(core.options);
    await vi.waitFor(() => expect(finishInitialization).toBeDefined());
    const disposal = core.dispose();
    finishInitialization?.();

    await expect(initialization).rejects.toThrow(
      'Core initialization stopped because Core is disposing.'
    );
    await disposal;
  });

  it('stops the physics interval and disposes physics', async () => {
    vi.useFakeTimers();
    const physicsStep = vi.fn();
    const dispose = vi.fn();
    core.physics = {
      physicsStep,
      dispose,
      timestep: 0.01,
    } as unknown as Core['physics'];
    const interval = setInterval(physicsStep, 10);
    (
      core as unknown as {physicsInterval?: ReturnType<typeof setInterval>}
    ).physicsInterval = interval;

    await core.dispose();

    physicsStep.mockClear();
    vi.advanceTimersByTime(100);
    expect(physicsStep).not.toHaveBeenCalled();
    expect(dispose).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });

  it('reports script callback errors through ScriptsManager events', async () => {
    const script = new Script();
    vi.spyOn(script, 'update').mockImplementation(() => {
      throw new Error('update failed');
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const listener = vi.fn();
    core.scriptsManager.addEventListener(
      ScriptsManagerEventType.EXCEPTION,
      listener
    );

    await scripts(core).initScript(script);
    scripts(core).update(0, {} as XRFrame);

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        context: 'update',
        error: expect.objectContaining({message: 'update failed'}),
      })
    );
  });

  it('runs script callbacks and renders through one Core frame', async () => {
    const script = new Script();
    const update = vi.spyOn(script, 'update');
    await scripts(core).initScript(script);

    (
      core as unknown as {update: (time: number, frame: XRFrame) => void}
    ).update(1000, {} as XRFrame);

    expect(update).toHaveBeenCalledWith(1000, expect.anything());
    expect(core.renderer.render).toHaveBeenCalledWith(core.scene, core.camera);
  });

  it.each([false, true])(
    'updates the headset camera before scripts (postprocessing: %s)',
    async (postprocessing) => {
      if (postprocessing) {
        core.effects = {
          render: vi.fn(),
          dispose: vi.fn(),
        } as unknown as Core['effects'];
      }
      const observedPosition = new THREE.Vector3();
      const script = new Script();
      vi.spyOn(script, 'update').mockImplementation(() => {
        observedPosition.copy(core.camera.position);
      });
      await scripts(core).initScript(script);
      core.renderer.xr.isPresenting = true;
      core.renderer.xr.updateCamera = vi.fn((camera: THREE.Camera) => {
        camera.position.set(0.4, 1.65, -0.2);
        camera.updateMatrixWorld();
      });

      (
        core as unknown as {update: (time: number, frame: XRFrame) => void}
      ).update(1000, {} as XRFrame);

      expect(core.renderer.xr.updateCamera).toHaveBeenCalledWith(core.camera);
      expect(observedPosition.toArray()).toEqual([0.4, 1.65, -0.2]);
    }
  );

  it('shares one in-flight simulator start and ignores later starts once running', async () => {
    vi.spyOn(
      core as unknown as {initialize(options: Options): Promise<void>},
      'initialize'
    ).mockResolvedValue();
    await core.init(core.options);

    const moduleLoaded =
      Promise.withResolvers<Awaited<ReturnType<SimulatorLoader>>>();
    const initStarted = Promise.withResolvers<Script>();
    const initialization = Promise.withResolvers<void>();
    simulatorLoader.mockReturnValue(moduleLoaded.promise);
    scripts(core).initScript = vi.fn((script: Script) => {
      initStarted.resolve(script);
      return initialization.promise;
    });
    scripts(core).onSimulatorStarted = vi.fn();
    expect(simulatorLoader).not.toHaveBeenCalled();
    expect(core.simulator).toBeUndefined();

    const firstStart = core.startSimulator();
    const secondStart = core.startSimulator();

    expect(simulatorLoader).toHaveBeenCalledOnce();
    expect(scripts(core).initScript).not.toHaveBeenCalled();
    expect(core.simulatorRunning).toBe(false);
    expect(scripts(core).onSimulatorStarted).not.toHaveBeenCalled();

    // Await the real runtime import without polling a cold module graph.
    moduleLoaded.resolve(await import('../simulator/Simulator.js'));
    const initializingSimulator = await initStarted.promise;
    const thirdStart = core.startSimulator();

    expect(scripts(core).initScript).toHaveBeenCalledOnce();
    expect(simulatorLoader).toHaveBeenCalledOnce();
    expect(core.simulator).toBeUndefined();
    expect(core.simulatorRunning).toBe(false);
    expect(scripts(core).onSimulatorStarted).not.toHaveBeenCalled();
    expect(initializingSimulator.parent).toBe(core.xrSystemsGroup);

    initialization.resolve();
    const startedSimulators = await Promise.all([
      firstStart,
      secondStart,
      thirdStart,
    ]);
    for (const simulator of startedSimulators) {
      expect(simulator).toBe(initializingSimulator);
    }

    expect(core.simulator).toBe(initializingSimulator);
    expect(core.simulatorRunning).toBe(true);
    expect(scripts(core).onSimulatorStarted).toHaveBeenCalledOnce();

    await expect(core.startSimulator()).resolves.toBe(initializingSimulator);

    expect(scripts(core).initScript).toHaveBeenCalledOnce();
    expect(simulatorLoader).toHaveBeenCalledOnce();
    expect(scripts(core).onSimulatorStarted).toHaveBeenCalledOnce();
  });

  it.each(['loader', 'initialization'])(
    'retains the entry UI after simulator %s rejection and retries with the same button',
    async (failureStage) => {
      vi.spyOn(
        core as unknown as {initialize(options: Options): Promise<void>},
        'initialize'
      ).mockResolvedValue();
      await core.init(core.options);

      const simulatorModule = await import('../simulator/Simulator.js');
      const moduleLoaded =
        Promise.withResolvers<Awaited<ReturnType<SimulatorLoader>>>();
      const initialization = Promise.withResolvers<void>();
      simulatorLoader
        .mockReturnValueOnce(moduleLoaded.promise)
        .mockResolvedValue(simulatorModule);
      const initScript = vi
        .fn<(script: Script) => Promise<void>>()
        .mockReturnValueOnce(initialization.promise)
        .mockResolvedValue();
      scripts(core).initScript = initScript;
      scripts(core).onSimulatorStarted = vi.fn();
      const disposeSimulator = vi.spyOn(
        simulatorModule.Simulator.prototype,
        'dispose'
      );
      const startSimulator = vi.fn(() => {
        const startup = core.startSimulator();
        // Observe the original rejection even when the old click handler drops it.
        void startup.catch(() => {});
        return startup;
      });
      core.webXRSessionManager = new WebXRSessionManager(
        core.renderer,
        {},
        'immersive-vr'
      );
      const button = new XRButton(
        core.webXRSessionManager,
        core.permissionsManager,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        undefined,
        true,
        startSimulator
      );
      core.xrButton = button;
      document.body.appendChild(button.domElement);
      const disposeButton = vi.spyOn(button, 'dispose');

      button.simulatorButtonElement.click();

      expect.soft(button.domElement.isConnected).toBe(true);
      expect.soft(core.xrButton).toBe(button);
      expect.soft(disposeButton).not.toHaveBeenCalled();
      expect.soft(button.simulatorButtonElement.disabled).toBe(true);
      expect(core.simulatorRunning).toBe(false);

      const error = new Error(`Simulator ${failureStage} failed.`);
      if (failureStage === 'loader') {
        moduleLoaded.reject(error);
        initialization.resolve();
      } else {
        moduleLoaded.resolve(simulatorModule);
        await vi.waitFor(() => expect(initScript).toHaveBeenCalledOnce());
        expect.soft(button.domElement.isConnected).toBe(true);
        expect.soft(disposeButton).not.toHaveBeenCalled();
        initialization.reject(error);
      }
      await expect(startSimulator.mock.results[0].value).rejects.toBe(error);
      await new Promise<void>((resolve) => setTimeout(resolve, 0));

      expect.soft(core.xrButton).toBe(button);
      expect.soft(button.domElement.isConnected).toBe(true);
      expect.soft(disposeButton).not.toHaveBeenCalled();
      expect.soft(button.simulatorButtonElement.disabled).toBe(false);
      const alert =
        button.domElement.querySelector<HTMLElement>('[role="alert"]');
      expect.soft(alert?.hidden).toBe(false);
      expect
        .soft(alert?.textContent)
        .toBe(`Simulator could not start. Error: ${error.message}`);
      expect(core.simulator).toBeUndefined();
      expect(core.simulatorRunning).toBe(false);
      expect(scripts(core).onSimulatorStarted).not.toHaveBeenCalled();
      if (failureStage === 'initialization') {
        expect(initScript.mock.calls[0][0].parent).toBeNull();
        expect(disposeSimulator).toHaveBeenCalledOnce();
      }

      button.simulatorButtonElement.click();
      await new Promise<void>((resolve) => setTimeout(resolve, 0));

      expect.soft(startSimulator).toHaveBeenCalledTimes(2);
      expect.soft(simulatorLoader).toHaveBeenCalledTimes(2);
      expect.soft(core.simulator).toBeInstanceOf(simulatorModule.Simulator);
      expect.soft(core.simulatorRunning).toBe(true);
      expect.soft(scripts(core).onSimulatorStarted).toHaveBeenCalledOnce();
      expect.soft(alert?.hidden).toBe(true);
      expect.soft(alert?.textContent).toBe('');
      expect.soft(disposeButton).toHaveBeenCalledOnce();
      expect.soft(core.xrButton).toBeUndefined();
      expect.soft(button.domElement.isConnected).toBe(false);
    }
  );

  it.each(['loader', 'initialization'])(
    'blocks XR entry during programmatic simulator %s and unlocks after failure',
    async (pendingStage) => {
      const originalNavigator = navigator;
      const events = new EventTarget();
      const session = Object.assign(events, {
        end: vi.fn(async () => events.dispatchEvent(new Event('end'))),
      }) as unknown as XRSession;
      const requestSession = vi.fn().mockResolvedValue(session);
      vi.stubGlobal('navigator', {
        xr: {
          isSessionSupported: vi.fn().mockResolvedValue(true),
          requestSession,
        },
      });
      try {
        vi.spyOn(
          core as unknown as {initialize(options: Options): Promise<void>},
          'initialize'
        ).mockResolvedValue();
        await core.init(core.options);
        core.renderer.xr.setSession = vi.fn().mockResolvedValue(undefined);
        vi.spyOn(
          core.permissionsManager,
          'checkAndRequestPermissions'
        ).mockResolvedValue({granted: true, status: 'granted'});

        core.webXRSessionManager = new WebXRSessionManager(
          core.renderer,
          {},
          'immersive-vr'
        );
        const button = new XRButton(
          core.webXRSessionManager,
          core.permissionsManager,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          undefined,
          true,
          core.startSimulator
        );
        core.xrButton = button;
        document.body.appendChild(button.domElement);
        await core.webXRSessionManager.initialize();
        expect(button.xrButtonElement.disabled).toBe(false);
        const disposeButton = vi.spyOn(button, 'dispose');

        const simulatorModule = await import('../simulator/Simulator.js');
        const moduleLoaded =
          Promise.withResolvers<Awaited<ReturnType<SimulatorLoader>>>();
        const initialization = Promise.withResolvers<void>();
        const initStarted = Promise.withResolvers<void>();
        simulatorLoader.mockReturnValueOnce(moduleLoaded.promise);
        const initScript = vi.fn(() => {
          initStarted.resolve();
          return initialization.promise;
        });
        scripts(core).initScript = initScript;
        scripts(core).onSimulatorStarted = vi.fn();

        const startup = core.startSimulator();
        const error = new Error(`Programmatic ${pendingStage} failed.`);
        const rejection = expect(startup).rejects.toBe(error);
        if (pendingStage === 'initialization') {
          moduleLoaded.resolve(simulatorModule);
          await initStarted.promise;
        }

        expect.soft(button.domElement.isConnected).toBe(true);
        expect.soft(button.xrButtonElement.disabled).toBe(true);
        expect.soft(button.simulatorButtonElement.disabled).toBe(true);
        button.xrButtonElement.click();
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        expect.soft(requestSession).not.toHaveBeenCalled();
        expect.soft(core.webXRSessionManager.currentSession).toBeUndefined();
        expect.soft(disposeButton).not.toHaveBeenCalled();

        if (pendingStage === 'loader') {
          moduleLoaded.reject(error);
          initialization.resolve();
        } else {
          initialization.reject(error);
        }
        await rejection;
        expect.soft(button.domElement.isConnected).toBe(true);
        expect.soft(button.xrButtonElement.disabled).toBe(false);
        expect.soft(button.simulatorButtonElement.disabled).toBe(false);
        expect.soft(core.simulatorRunning).toBe(false);

        if (core.webXRSessionManager.currentSession) {
          await core.webXRSessionManager.endSession();
        }
        simulatorLoader.mockResolvedValue(simulatorModule);
        initScript.mockResolvedValue(undefined);
        await core.startSimulator();
        expect(core.simulatorRunning).toBe(true);
        expect(disposeButton).toHaveBeenCalledOnce();
        expect(button.domElement.isConnected).toBe(false);
        expect(core.xrButton).toBeUndefined();
      } finally {
        vi.stubGlobal('navigator', originalNavigator);
      }
    }
  );

  it.each(['loader', 'initialization'])(
    'stops simulator startup during %s when Core is disposed',
    async (pendingStage) => {
      vi.spyOn(
        core as unknown as {initialize(options: Options): Promise<void>},
        'initialize'
      ).mockResolvedValue();
      await core.init(core.options);

      const simulatorModule = await import('../simulator/Simulator.js');
      const moduleLoaded =
        Promise.withResolvers<Awaited<ReturnType<SimulatorLoader>>>();
      const initialization = Promise.withResolvers<void>();
      simulatorLoader.mockReturnValue(moduleLoaded.promise);
      const initScript = vi
        .fn<(script: Script) => Promise<void>>()
        .mockReturnValue(initialization.promise);
      scripts(core).initScript = initScript;
      scripts(core).onSimulatorStarted = vi.fn();
      const disposeSimulator = vi.spyOn(
        simulatorModule.Simulator.prototype,
        'dispose'
      );
      const startup = core.startSimulator();
      void startup.catch(() => {});
      if (pendingStage === 'initialization') {
        moduleLoaded.resolve(simulatorModule);
        await vi.waitFor(() => expect(initScript).toHaveBeenCalledOnce());
      }

      const disposal = core.dispose();
      moduleLoaded.resolve(simulatorModule);
      initialization.resolve();

      await expect(startup).rejects.toThrow('while it is disposing');
      await disposal;
      expect(core.simulator).toBeUndefined();
      expect(core.simulatorRunning).toBe(false);
      expect(scripts(core).onSimulatorStarted).not.toHaveBeenCalled();
      if (pendingStage === 'initialization') {
        expect(initScript.mock.calls[0][0].parent).toBeNull();
        expect(disposeSimulator).toHaveBeenCalledOnce();
      } else {
        expect(initScript).not.toHaveBeenCalled();
      }
    }
  );
});
