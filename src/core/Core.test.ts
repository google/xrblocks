import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  MockInstance,
} from 'vitest';

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
import {Script, SelectEvent} from './Script';
import {Controller} from '../input/Controller';
import {Physics} from '../physics/Physics';
import {
  ScriptsManagerEventType,
  ScriptsManagerEventMap,
} from './components/ScriptsManager';

type ExceptionEvent =
  ScriptsManagerEventMap[ScriptsManagerEventType.EXCEPTION] & {type: string};

describe('Core and ScriptsManager exception handling via EventDispatcher', () => {
  let core: Core;
  let consoleErrorSpy: MockInstance;

  beforeEach(() => {
    // Reset Core singleton to ensure fresh state for each test
    Core.instance = undefined;
    core = new Core();
    core.options = new Options();

    // Mock core dependencies/methods to isolate update and physics loops
    core.renderer = {
      render: vi.fn(),
      xr: {
        enabled: false,
        getDepthSensingMesh: vi.fn(),
        setReferenceSpaceType: vi.fn(),
      },
    } as unknown as THREE.WebGLRenderer;
    core.depth.update = vi.fn();
    core.input.update = vi.fn();
    core.scriptsManager.syncScriptsWithScene = vi.fn();
    core.waitFrame.onFrame = vi.fn();
    core.screenshotSynthesizer.onAfterRender = vi.fn();

    // Spy on console.error
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('catchScriptExceptions defaults to true', () => {
    it('should have catchScriptExceptions enabled by default', () => {
      expect(core.options.catchScriptExceptions).toBe(true);
    });
  });

  describe('update loop via ScriptsManager', () => {
    it('should catch script exceptions, emit exception event, and continue updating other scripts when enabled', () => {
      const script1 = {
        name: 'Script1',
        ux: {reset: vi.fn()},
        update: vi.fn().mockImplementation(() => {
          throw new Error('Script1 crashed');
        }),
      } as unknown as Script;

      const script2 = {
        name: 'Script2',
        ux: {reset: vi.fn()},
        update: vi.fn(),
      } as unknown as Script;

      core.scriptsManager.scripts = new Set([script1, script2]);

      const events: ExceptionEvent[] = [];
      core.scriptsManager.addEventListener(
        ScriptsManagerEventType.EXCEPTION,
        (event) => {
          events.push(event);
        }
      );

      expect(() => {
        (
          core as unknown as {update: (time: number, frame: XRFrame) => void}
        ).update(1000, {} as XRFrame);
      }).not.toThrow();

      // Both scripts had their UX reset
      expect(script1.ux.reset).toHaveBeenCalled();
      expect(script2.ux.reset).toHaveBeenCalled();

      // Both updates were attempted
      expect(script1.update).toHaveBeenCalled();
      expect(script2.update).toHaveBeenCalled();

      // console.error was called with the error details
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('An error occurred in script Script1 [update]'),
        expect.any(Error)
      );

      // EXCEPTION event is dispatched with correct payload
      expect(events.length).toBe(1);
      expect(events[0]).toEqual(
        expect.objectContaining({
          type: ScriptsManagerEventType.EXCEPTION,
          scriptName: 'Script1',
          context: 'update',
          error: expect.any(Error),
          timestamp: expect.any(Number),
        })
      );
    });

    it('should propagate script exceptions immediately and NOT emit exception event when disabled', () => {
      core.scriptsManager.catchExceptions = false;

      const script1 = {
        name: 'Script1',
        ux: {reset: vi.fn()},
        update: vi.fn().mockImplementation(() => {
          throw new Error('Script1 crashed');
        }),
      } as unknown as Script;

      const script2 = {
        name: 'Script2',
        ux: {reset: vi.fn()},
        update: vi.fn(),
      } as unknown as Script;

      core.scriptsManager.scripts = new Set([script1, script2]);

      const events: ExceptionEvent[] = [];
      core.scriptsManager.addEventListener(
        ScriptsManagerEventType.EXCEPTION,
        (event) => {
          events.push(event);
        }
      );

      expect(() => {
        (
          core as unknown as {update: (time: number, frame: XRFrame) => void}
        ).update(1000, {} as XRFrame);
      }).toThrow('Script1 crashed');

      // script2.update should not be called since script1.update threw and stopped the loop
      expect(script1.update).toHaveBeenCalled();
      expect(script2.update).not.toHaveBeenCalled();
      expect(consoleErrorSpy).not.toHaveBeenCalled();

      // EXCEPTION event is not emitted
      expect(events.length).toBe(0);
    });

    it('should catch and emit individual events for exceptions in UX reset, onSelecting, and onSqueezing', () => {
      const script1 = {
        name: 'Script1',
        ux: {
          reset: vi.fn().mockImplementation(() => {
            throw new Error('UX reset crashed');
          }),
        },
        onSelecting: vi.fn().mockImplementation(() => {
          throw new Error('onSelecting crashed');
        }),
        onSqueezing: vi.fn().mockImplementation(() => {
          throw new Error('onSqueezing crashed');
        }),
        update: vi.fn(),
      } as unknown as Script;

      const script2 = {
        name: 'Script2',
        ux: {reset: vi.fn()},
        onSelecting: vi.fn(),
        onSqueezing: vi.fn(),
        update: vi.fn(),
      } as unknown as Script;

      core.scriptsManager.scripts = new Set([script1, script2]);

      // Set up mock controllers to trigger selection and squeezing callbacks
      core.input.controllers = [
        {
          userData: {
            selected: true,
            squeezing: true,
          },
        },
      ] as unknown as Controller[];

      const events: ExceptionEvent[] = [];
      core.scriptsManager.addEventListener(
        ScriptsManagerEventType.EXCEPTION,
        (event) => {
          events.push(event);
        }
      );

      expect(() => {
        (
          core as unknown as {update: (time: number, frame: XRFrame) => void}
        ).update(1000, {} as XRFrame);
      }).not.toThrow();

      // script2 calls should still execute successfully
      expect(script2.ux.reset).toHaveBeenCalled();
      expect(script2.onSelecting).toHaveBeenCalled();
      expect(script2.onSqueezing).toHaveBeenCalled();
      expect(script2.update).toHaveBeenCalled();

      // console.error is called three times
      expect(consoleErrorSpy).toHaveBeenCalledTimes(3);

      // Three events are dispatched
      expect(events.length).toBe(3);
      expect(events.map((e) => e.context)).toEqual([
        'ux.reset',
        'onSelecting',
        'onSqueezing',
      ]);
    });
  });

  describe('event callbacks robustness', () => {
    it('should catch and emit exceptions inside callSelectStart without crashing other scripts', () => {
      const script1 = {
        name: 'Script1',
        onSelectStart: vi.fn().mockImplementation(() => {
          throw new Error('SelectStart error');
        }),
      } as unknown as Script;

      const script2 = {
        name: 'Script2',
        onSelectStart: vi.fn(),
      } as unknown as Script;

      core.scriptsManager.scripts = new Set([script1, script2]);

      const events: ExceptionEvent[] = [];
      core.scriptsManager.addEventListener(
        ScriptsManagerEventType.EXCEPTION,
        (event) => {
          events.push(event);
        }
      );

      expect(() => {
        core.scriptsManager.callSelectStart({} as unknown as SelectEvent);
      }).not.toThrow();

      expect(script1.onSelectStart).toHaveBeenCalled();
      expect(script2.onSelectStart).toHaveBeenCalled();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining('[onSelectStart]'),
        expect.any(Error)
      );
      expect(events.length).toBe(1);
      expect(events[0].context).toBe('onSelectStart');
    });
  });

  describe('physics step', () => {
    it('should catch and emit physicsStep exceptions without crashing physics simulation', () => {
      core.physics = {
        physicsStep: vi.fn(),
      } as unknown as Physics;

      const script1 = {
        name: 'Script1',
        physicsStep: vi.fn().mockImplementation(() => {
          throw new Error('physicsStep crashed');
        }),
      } as unknown as Script;

      const script2 = {
        name: 'Script2',
        physicsStep: vi.fn(),
      } as unknown as Script;

      core.scriptsManager.scripts = new Set([script1, script2]);

      const events: ExceptionEvent[] = [];
      core.scriptsManager.addEventListener(
        ScriptsManagerEventType.EXCEPTION,
        (event) => {
          events.push(event);
        }
      );

      expect(() => {
        (core as unknown as {physicsStep: () => void}).physicsStep();
      }).not.toThrow();

      expect(script1.physicsStep).toHaveBeenCalled();
      expect(script2.physicsStep).toHaveBeenCalled();

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        expect.stringContaining(
          'An error occurred in script Script1 [physicsStep]'
        ),
        expect.any(Error)
      );
      expect(events.length).toBe(1);
      expect(events[0].context).toBe('physicsStep');
    });

    it('should propagate physicsStep exceptions immediately when disabled', () => {
      core.scriptsManager.catchExceptions = false;
      core.physics = {
        physicsStep: vi.fn(),
      } as unknown as Physics;

      const script1 = {
        name: 'Script1',
        physicsStep: vi.fn().mockImplementation(() => {
          throw new Error('physicsStep crashed');
        }),
      } as unknown as Script;

      const script2 = {
        name: 'Script2',
        physicsStep: vi.fn(),
      } as unknown as Script;

      core.scriptsManager.scripts = new Set([script1, script2]);

      const events: ExceptionEvent[] = [];
      core.scriptsManager.addEventListener(
        ScriptsManagerEventType.EXCEPTION,
        (event) => {
          events.push(event);
        }
      );

      expect(() => {
        (core as unknown as {physicsStep: () => void}).physicsStep();
      }).toThrow('physicsStep crashed');

      expect(script1.physicsStep).toHaveBeenCalled();
      expect(script2.physicsStep).not.toHaveBeenCalled();
      expect(events.length).toBe(0);
    });
  });

  describe('simulator startup', () => {
    it('shares one in-flight simulator start and ignores later starts once running', async () => {
      let finishInit: (() => void) | undefined;
      core.scriptsManager.initScript = vi.fn(
        () =>
          new Promise<void>((resolve) => {
            finishInit = resolve;
          })
      );
      core.scriptsManager.onSimulatorStarted = vi.fn();

      const startSimulator = (
        core as unknown as {startSimulator: () => Promise<void>}
      ).startSimulator;

      const firstStart = startSimulator();
      const secondStart = startSimulator();

      expect(core.scriptsManager.initScript).toHaveBeenCalledTimes(1);
      expect(core.simulatorRunning).toBe(false);

      finishInit?.();
      await Promise.all([firstStart, secondStart]);

      expect(core.simulatorRunning).toBe(true);
      expect(core.scriptsManager.onSimulatorStarted).toHaveBeenCalledTimes(1);

      await startSimulator();

      expect(core.scriptsManager.initScript).toHaveBeenCalledTimes(1);
      expect(core.scriptsManager.onSimulatorStarted).toHaveBeenCalledTimes(1);
    });
  });
});
