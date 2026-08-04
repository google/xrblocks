import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

vi.hoisted(() => {
  vi.stubGlobal('AudioContext', function () {
    return {
      createGain: () => ({connect: () => {}}),
      destination: {},
    };
  });
});

import {Core} from './Core';
import {Options} from './Options';
import {Script} from './Script';
import {ScriptsManager} from './components/ScriptsManager';

function scripts(core: Core): ScriptsManager {
  return (core as unknown as {scriptsManager: ScriptsManager}).scriptsManager;
}

describe('Core lifecycle', () => {
  let core: Core;

  beforeEach(async () => {
    await Core.instance?.dispose();
    Core.instance = undefined;
    core = new Core();
    core.options = new Options();
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

  it('reports script callback errors through Core', async () => {
    const script = new Script();
    vi.spyOn(script, 'update').mockImplementation(() => {
      throw new Error('update failed');
    });
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const listener = vi.fn();
    core.onScriptError(listener);
    await scripts(core).initScript(script);

    scripts(core).update(0, {} as XRFrame);

    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        context: 'update',
        error: expect.objectContaining({message: 'update failed'}),
      })
    );
  });
});
