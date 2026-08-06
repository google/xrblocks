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

function scripts(core: Core): ScriptsManager {
  return (core as unknown as {scriptsManager: ScriptsManager}).scriptsManager;
}

type SimulatorLoader = () => Promise<
  typeof import('../simulator/Simulator.js')
>;

describe('Core frame and simulator lifecycle', () => {
  let core: Core;

  beforeEach(async () => {
    await Core.instance?.dispose();
    Core.instance = undefined;
    core = new Core();
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

  afterEach(() => {
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

  it('shares one in-flight simulator start and ignores later starts once running', async () => {
    vi.spyOn(
      core as unknown as {initialize(options: Options): Promise<void>},
      'initialize'
    ).mockResolvedValue();
    await core.init(core.options);

    let finishInit: (() => void) | undefined;
    scripts(core).initScript = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          finishInit = resolve;
        })
    );
    scripts(core).onSimulatorStarted = vi.fn();
    const simulatorLoader = vi.fn<SimulatorLoader>(
      () => import('../simulator/Simulator.js')
    );
    (core as unknown as {simulatorLoader: SimulatorLoader}).simulatorLoader =
      simulatorLoader;
    expect(simulatorLoader).not.toHaveBeenCalled();
    expect(core.simulator).toBeUndefined();

    const startSimulator = (
      core as unknown as {startSimulator: () => Promise<void>}
    ).startSimulator;

    const firstStart = startSimulator();
    const secondStart = startSimulator();

    await vi.waitFor(() =>
      expect(scripts(core).initScript).toHaveBeenCalledOnce()
    );
    const initializingSimulator = vi.mocked(scripts(core).initScript).mock
      .calls[0][0];
    expect(simulatorLoader).toHaveBeenCalledOnce();
    expect(core.simulatorRunning).toBe(false);
    expect(initializingSimulator.parent).toBe(core.xrSystemsGroup);

    finishInit?.();
    await Promise.all([firstStart, secondStart]);

    expect(core.simulatorRunning).toBe(true);
    expect(scripts(core).onSimulatorStarted).toHaveBeenCalledOnce();

    await startSimulator();

    expect(scripts(core).initScript).toHaveBeenCalledOnce();
    expect(simulatorLoader).toHaveBeenCalledOnce();
    expect(scripts(core).onSimulatorStarted).toHaveBeenCalledOnce();
  });
});
