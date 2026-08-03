import './setup';
import * as THREE from 'three';
import {
  Core,
  Options,
  Script,
  type Constructor,
  type ScriptError,
} from 'xrblocks';
import {
  EmbodiedControl,
  type EmbodiedControlOptions,
} from '../embodied-control';
export interface TestRunnerConfig {
  /** Scripts to load into the test scene. */
  scripts?: Script[];
  /** Core configuration option overrides. */
  options?: Options;
  /** Options passed to the underlying EmbodiedControl addon. */
  embodiedOptions?: EmbodiedControlOptions;
}

export class TestRunner {
  readonly core: Core;
  readonly embodiedControl: EmbodiedControl;
  readonly scene: THREE.Scene;
  readonly camera: THREE.Camera;
  readonly actions: EmbodiedControl;

  private caughtErrors: Error[] = [];
  private readonly unsubscribeScriptErrors: () => void;

  private constructor(core: Core, embodiedControl: EmbodiedControl) {
    this.core = core;
    this.embodiedControl = embodiedControl;
    this.scene = core.scene;
    this.camera = core.camera;

    this.unsubscribeScriptErrors = core.onScriptError((event: ScriptError) => {
      const error =
        event.error ||
        new Error(
          `Exception in script: ${event.scriptName} (${event.context})`
        );
      this.caughtErrors.push(error);
    });

    // Set up the dynamic actions proxy.
    this.actions = new Proxy(this.embodiedControl, {
      get: (target, prop) => {
        const val = (target as unknown as Record<string | symbol, unknown>)[
          prop
        ];
        if (typeof val === 'function') {
          const fn = val as (...args: unknown[]) => unknown;
          return async (...args: unknown[]) => {
            const result = fn.apply(target, args);
            if (result instanceof Promise) {
              await result;
            }
            this.checkErrors();
          };
        }
        return val;
      },
    }) as unknown as EmbodiedControl;
  }

  static async create(config: TestRunnerConfig = {}): Promise<TestRunner> {
    const core = Core.instance || new Core();
    const options = config.options || new Options();

    options.enableSimulator = true;
    options.xrButton.alwaysAutostartSimulator = true;
    options.gestures.updateIntervalMs = 0; // Disable real-time throttle for headless tests.

    options.simulator.environments = [
      {
        name: 'Empty Test Environment',
        manifestPath: 'data:application/json,%7B%22objects%22%3A%5B%5D%7D',
      },
    ];
    options.simulator.activeEnvironmentIndex = 0;

    core.options = options;

    if (config.scripts) {
      for (const script of config.scripts) {
        core.scene.add(script);
      }
    }

    const embodiedOptions: EmbodiedControlOptions = {
      autoPause: true,
      realTime: false,
      ...config.embodiedOptions,
    };
    const embodiedControl = new EmbodiedControl(embodiedOptions);
    core.scene.add(embodiedControl);
    const runner = new TestRunner(core, embodiedControl);

    await core.init(options);

    while (!core.simulatorRunning) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    // Automatically re-trigger hand bone loading under JSDOM to populate virtual hand skeletons.
    if (core.simulator?.hands) {
      core.simulator.hands.leftHandBones = [];
      core.simulator.hands.rightHandBones = [];
      core.simulator.hands.loadMeshes();
    }

    for (let i = 0; i < Math.min(2, core.input.controllers.length); i++) {
      const controller = core.input.controllers[i];
      controller.userData.connected = true;
      if (i === 0) {
        core.input.leftController = controller;
      } else if (i === 1) {
        core.input.rightController = controller;
      }
    }

    core.camera.updateMatrixWorld(true);
    core.camera.matrixWorldInverse.copy(core.camera.matrixWorld).invert();

    runner.checkErrors();
    return runner;
  }

  /**
   * Retrieves a loaded script instance from the dependency injection registry.
   */
  getScript<T extends Script>(klass: Constructor<T>): T {
    const script = this.core.registry.get(klass);
    if (!script) {
      throw new Error(
        `Script or subsystem for ${klass.name} not found in Core registry.`
      );
    }
    return script;
  }

  /** Disposes the Core lifetime owned by this runner. */
  async destroy(): Promise<void> {
    let firstError: unknown;
    try {
      this.checkErrors();
    } catch (error) {
      firstError = error;
    }
    this.unsubscribeScriptErrors();
    try {
      await this.core.dispose();
    } catch (error) {
      firstError ??= error;
    }
    if (firstError !== undefined) throw firstError;
  }

  private checkErrors() {
    if (this.caughtErrors.length > 0) {
      const combined = this.caughtErrors
        .map((e) => e.stack || e.message)
        .join('\n\n');
      this.caughtErrors = [];
      throw new Error(`Test failed due to script exceptions:\n${combined}`);
    }
  }
}
