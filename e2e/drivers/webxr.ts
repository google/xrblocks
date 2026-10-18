import type {Page} from '@playwright/test';
import type {
  CompoundControl,
  FrameStats,
  Hand,
  XRTestDriver,
  DriverState,
} from './types';
import {captureFrameStats} from './frame-stats';

type IwerController = {
  position: number[];
  quaternion: number[];
  updateButtonValue(id: string, value: number): void;
};

export type IwerDriverOptions = {
  sessionMode?: 'immersive-vr' | 'immersive-ar';
  /** Overrides Quest 3's immersive-ar blend mode for this test. */
  environmentBlendMode?: 'opaque' | 'additive' | 'alpha-blend';
  initialTheme?: string;
  simulateAdditiveDisplay?: boolean;
};

declare global {
  interface Window {
    __e2e: {
      ready: Promise<void>;
      embodied: {
        step(input: {
          durationMs?: number;
          control?: CompoundControl;
        }): Promise<void>;
        pointTo(
          handIndex: number,
          target: unknown,
          options?: {velocity?: number}
        ): Promise<void>;
      };
      objects: Record<string, unknown>;
      displayState(): {
        environmentBlendMode: string | null;
        surface: string;
        additiveSimulationActive: boolean;
      };
      endSession(): Promise<void>;
      buttonClicks(): {a: number; b: number};
      state(): DriverState;
    };
    __xrDevice: {
      controllers: {left?: IwerController; right?: IwerController};
    };
  }
}

const HAND: Record<Hand, 'left' | 'right'> = {
  leftHand: 'left',
  rightHand: 'right',
};

type TransientPointerState = {
  source: Record<string, unknown>;
  controller: {
    dispatchEvent(event: {type: string; data?: unknown}): void;
  };
  remove(): void;
  replace(): Record<string, unknown>;
  aim(buttonName: string): void;
};

/**
 * Drives the REAL WebXR code path through Meta's IWER (Immersive Web
 * Emulation Runtime): `navigator.xr` is replaced by an emulated headset
 * before any page script runs, so `WebXRSessionManager.startSession()`,
 * reference spaces, the XR frame loop, and XR input sources all execute
 * exactly as on device — just with a software device behind them.
 */
export class IwerDriver implements XRTestDriver {
  /** Not used by this driver; kept for interface symmetry. */
  webgpu = false;

  constructor(
    private readonly page: Page,
    private readonly options: IwerDriverOptions = {}
  ) {}

  async boot(appPath: string): Promise<void> {
    const base = process.env.E2E_BASE_URL;
    if (!base) {
      throw new Error('E2E_BASE_URL is not set (global setup did not run).');
    }
    // IWER must exist before the app runs: this is what makes the SDK take
    // its WebXR path instead of the desktop simulator.
    await this.page.addInitScript({
      path: new URL('../../node_modules/iwer/build/iwer.js', import.meta.url)
        .pathname,
    });
    // The Synthetic Environment Module emulates planes, meshes, hit-test,
    // and depth; it attaches to the IWER namespace and needs IWER first.
    await this.page.addInitScript({
      path: new URL(
        '../../node_modules/@iwer/sem/build/iwer-sem.js',
        import.meta.url
      ).pathname,
    });
    await this.page.addInitScript((environmentBlendMode) => {
      type SemInstance = {
        loadDefaultEnvironment(id: string): Promise<void>;
      };
      const globals = globalThis as unknown as {
        IWER: {
          XRDevice: new (config: unknown) => unknown;
          metaQuest3: {
            environmentBlendModes: Record<string, string>;
          };
        };
        IWER_SEM: {
          SyntheticEnvironmentModule: new (device: unknown) => SemInstance;
        };
      };
      const metaQuest3 = globals.IWER.metaQuest3;
      const deviceConfig =
        environmentBlendMode === null
          ? metaQuest3
          : {
              ...metaQuest3,
              environmentBlendModes: {
                ...metaQuest3.environmentBlendModes,
                'immersive-ar': environmentBlendMode,
              },
            };
      const device = new globals.IWER.XRDevice(deviceConfig);
      // forceInstall: 127.0.0.1 is a secure context, so Chromium exposes its
      // native navigator.xr (which reports no headset). The emulated runtime
      // must replace it.
      (
        device as unknown as {
          installRuntime(options?: {forceInstall?: boolean}): void;
        }
      ).installRuntime({forceInstall: true});
      // installSEM constructs the SEM and stores it for the device's frame
      // loop; a subclass captures the instance for environment loading.
      const holder: {sem?: SemInstance} = {};
      class CapturedSem extends globals.IWER_SEM.SyntheticEnvironmentModule {
        constructor(dev: unknown) {
          super(dev);
          holder.sem = this;
        }
      }
      (
        device as unknown as {
          installSEM(ctor: new (device: unknown) => unknown): void;
        }
      ).installSEM(CapturedSem);
      (globalThis as Record<string, unknown>).__xrDevice = device;
      (globalThis as Record<string, unknown>).__xrSem = holder.sem;
      (globalThis as Record<string, unknown>).__xrSemReady =
        holder.sem?.loadDefaultEnvironment('living_room');
    }, this.options.environmentBlendMode ?? null);
    // No xrAutomation: the simulator must stay out of the way.
    const separator = appPath.includes('?') ? '&' : '?';
    const sessionMode = this.options.sessionMode ?? 'immersive-vr';
    await this.page.goto(
      `${base}/${appPath}${separator}debug=1&xr=1&sessionMode=${sessionMode}`
    );
    await this.page.waitForFunction(
      () =>
        typeof window !== 'undefined' &&
        'xb' in window &&
        Boolean(window.__e2e),
      undefined,
      {timeout: 30_000}
    );
    await this.page.evaluate(() => window.__e2e.ready);
    await this.page.evaluate((options) => {
      const xb = (
        window as unknown as {
          xb: {
            ui: {theme: string};
            core: {options: {simulateAdditiveDisplay: boolean}};
          };
        }
      ).xb;
      if (options.initialTheme !== undefined) {
        xb.ui.theme = options.initialTheme;
      }
      if (options.simulateAdditiveDisplay !== undefined) {
        xb.core.options.simulateAdditiveDisplay =
          options.simulateAdditiveDisplay;
      }
    }, this.options);
    // Enter the selected immersive session through the SDK's session manager.
    await this.page.evaluate(async () =>
      (
        window as unknown as {
          xb: {
            core: {
              webXRSessionManager: {startSession(): Promise<void>};
              renderer: {xr: {isPresenting: boolean}};
            };
          };
        }
      ).xb.core.webXRSessionManager.startSession()
    );
    await this.page.waitForFunction(
      () =>
        (
          window as unknown as {
            xb?: {
              core?: {renderer?: {xr?: {isPresenting?: boolean}}};
            };
          }
        ).xb?.core?.renderer?.xr?.isPresenting === true,
      undefined,
      {timeout: 20_000}
    );
    // Perception data only exists once the synthetic environment is loaded.
    await this.page.evaluate(
      () =>
        (globalThis as Record<string, unknown>).__xrSemReady as Promise<unknown>
    );
  }

  /** The XR frame loop runs on real time; just wait. */
  step(durationMs: number, _control?: CompoundControl): Promise<void> {
    return this.page.waitForTimeout(durationMs);
  }

  getState(): Promise<DriverState> {
    return this.page.evaluate(() => window.__e2e.state());
  }

  /** Aim an emulated XR controller at a named scene object. */
  async pointTo(hand: Hand, objectName: string): Promise<void> {
    await this.page.evaluate(
      ([handedness, name]) => {
        const target = (
          window as unknown as {
            __e2e: {objects: Record<string, unknown>};
          }
        ).__e2e.objects[name as string];
        if (!target) throw new Error(`No object named ${name}.`);
        const object = target as unknown as {
          updateWorldMatrix(
            updateParents: boolean,
            updateChildren: boolean
          ): void;
          matrixWorld: {elements: number[]};
        };
        object.updateWorldMatrix(true, false);
        const world = object.matrixWorld.elements;
        const position = [world[12], world[13], world[14]];
        const controller = (
          window as unknown as {
            __xrDevice: {
              controllers: Record<
                string,
                | {
                    position: {
                      set(x: number, y: number, z: number): unknown;
                    };
                    quaternion: {
                      set(x: number, y: number, z: number, w: number): unknown;
                    };
                  }
                | undefined
              >;
            };
          }
        ).__xrDevice.controllers[handedness as string];
        if (!controller) throw new Error(`No ${handedness} controller.`);
        // Aim the controller 30cm back along +z from the target so its
        // forward ray hits. Use the IWER math setters: index writes do not
        // reach the emulated pose (the Vector3 wraps an internal vec3).
        controller.position.set(position[0], position[1], position[2] + 0.3);
        controller.quaternion.set(0, 0, 0, 1);
      },
      [HAND[hand], objectName] as const
    );
    // Let the XR loop register the new pose.
    await this.page.waitForTimeout(120);
  }

  /** Press/release the emulated controller's trigger. */
  async select(hand: Hand, press: boolean): Promise<void> {
    await this.page.evaluate(
      ([handedness, value]) => {
        const controller = (
          window as unknown as {
            __xrDevice: {
              controllers: Record<
                string,
                | {
                    updateButtonValue(id: string, v: number): void;
                  }
                | undefined
              >;
            };
          }
        ).__xrDevice.controllers[handedness as string];
        if (!controller) throw new Error(`No ${handedness} controller.`);
        controller.updateButtonValue('trigger', value as number);
      },
      [HAND[hand], press ? 1 : 0] as const
    );
    await this.page.waitForTimeout(120);
  }

  /** Click a UI button with native select events before the source vanishes. */
  async pinchTransientButton(buttonName: 'buttonA' | 'buttonB'): Promise<void> {
    await this.prepareTransientPointer(buttonName);
    await this.page.evaluate(() => {
      const state = (
        globalThis as unknown as {__transientPointer: TransientPointerState}
      ).__transientPointer;
      const {controller} = state;
      controller.dispatchEvent({type: 'selectstart', data: state.source});
    });
    await this.page.waitForTimeout(120);
    await this.page.evaluate(() => {
      const state = (
        globalThis as unknown as {__transientPointer: TransientPointerState}
      ).__transientPointer;
      const {controller} = state;
      controller.dispatchEvent({type: 'select', data: state.source});
      controller.dispatchEvent({type: 'selectend', data: state.source});
      state.remove();
    });
    await this.page.waitForTimeout(120);
  }

  /** Release A while immediately reusing its WebXR controller slot for B. */
  async pinchTransientButtonsWithSlotReuse(): Promise<{
    afterReuse: {
      clicks: {a: number; b: number};
      buttonBSelecting: boolean;
    };
    afterButtonBRelease: {a: number; b: number};
  }> {
    await this.prepareTransientPointer('buttonA');
    await this.page.evaluate(() => {
      const state = (
        globalThis as unknown as {__transientPointer: TransientPointerState}
      ).__transientPointer;
      const {controller} = state;

      controller.dispatchEvent({type: 'selectstart', data: state.source});
    });
    await this.page.waitForTimeout(120);
    await this.page.evaluate(() => {
      const state = (
        globalThis as unknown as {__transientPointer: TransientPointerState}
      ).__transientPointer;
      const {controller} = state;
      controller.dispatchEvent({type: 'select', data: state.source});
      controller.dispatchEvent({type: 'selectend', data: state.source});
      state.remove();
      state.aim('buttonB');
      const nextSource = state.replace();
      controller.dispatchEvent({type: 'selectstart', data: nextSource});
    });
    // Let the first frame consume A's saved release and the next frame begin B.
    await this.page.waitForTimeout(120);
    const afterReuse = await this.page.evaluate(() => {
      const core = (
        window as unknown as {
          xb: {
            core: {
              interaction: {isSelectingAt(target: unknown): boolean};
            };
          };
        }
      ).xb.core;
      return {
        clicks: window.__e2e.buttonClicks(),
        buttonBSelecting: core.interaction.isSelectingAt(
          window.__e2e.objects.buttonB
        ),
      };
    });
    await this.page.evaluate(() => {
      const state = (
        globalThis as unknown as {__transientPointer: TransientPointerState}
      ).__transientPointer;
      const {controller} = state;
      controller.dispatchEvent({type: 'select', data: state.source});
      controller.dispatchEvent({type: 'selectend', data: state.source});
      state.remove();
    });
    await this.page.waitForTimeout(120);
    return {
      afterReuse,
      afterButtonBRelease: await this.page.evaluate(() =>
        window.__e2e.buttonClicks()
      ),
    };
  }

  private async prepareTransientPointer(
    buttonName: 'buttonA' | 'buttonB'
  ): Promise<void> {
    await this.page.waitForFunction(() => {
      const core = (window as any).xb?.core;
      const session = core?.renderer?.xr?.getSession();
      if (!session) return false;
      const source = Array.from(session.inputSources).find(
        (inputSource: any) => inputSource.handedness === 'right'
      );
      return Boolean(
        source &&
          core.input.controllers.some(
            (controller: any) => controller.inputSource === source
          )
      );
    });
    await this.page.evaluate((name) => {
      const globals = globalThis as unknown as {
        __xrDevice: {
          controllers: Record<
            string,
            {
              position: {set(x: number, y: number, z: number): unknown};
              quaternion: {
                set(x: number, y: number, z: number, w: number): unknown;
              };
            }
          >;
        };
      };
      const core = (window as unknown as {xb: {core: any}}).xb.core;
      const session = core.renderer.xr.getSession();
      const original = Array.from(session.inputSources).find(
        (source: any) => source.handedness === 'right'
      ) as any;
      if (!original) throw new Error('IWER has no right-hand input source.');
      const controller = core.input.controllers.find(
        (candidate: any) => candidate.inputSource === original
      );
      if (!controller) {
        throw new Error(
          'No XR Blocks controller is connected to the IWER source.'
        );
      }

      const transientSource = () => ({
        handedness: 'none',
        targetRayMode: 'transient-pointer',
        profiles: original.profiles,
        targetRaySpace: original.targetRaySpace,
        gripSpace: original.gripSpace,
        // A transient pointer has no controller gamepad and completes through
        // its own native select/selectend events.
        gamepad: undefined,
        hand: null,
      });
      let source = transientSource();
      const sourceChange = (added: object[], removed: object[]) => {
        const event = new Event('inputsourceschange');
        Object.defineProperties(event, {
          added: {value: added},
          removed: {value: removed},
        });
        session.dispatchEvent(event);
      };
      const aim = (targetName: string) => {
        const object = (window as any).__e2e.objects[targetName];
        if (!object) throw new Error(`No object named ${targetName}.`);
        object.updateWorldMatrix(true, false);
        const {elements} = object.matrixWorld;
        const controller = globals.__xrDevice.controllers.right;
        controller.position.set(elements[12], elements[13], elements[14] + 0.3);
        controller.quaternion.set(0, 0, 0, 1);
      };
      const remove = () => sourceChange([], [source]);
      const replace = () => {
        source = transientSource();
        sourceChange([source], []);
        return source;
      };

      // Free the right controller's Three.js slot, then reconnect a synthetic
      // transient-pointer source using IWER's real target-ray space.
      aim(name as string);
      sourceChange([source], [original]);
      (globalThis as Record<string, unknown>).__transientPointer = {
        source,
        controller,
        remove,
        replace,
        aim,
      };
    }, buttonName);
    await this.page.waitForTimeout(120);
    await this.page.waitForFunction((name) => {
      const core = (window as any).xb.core;
      return core.interaction.isPointingAt((window as any).__e2e.objects[name]);
    }, buttonName);
  }

  captureFrame(): Promise<FrameStats> {
    return captureFrameStats(this.page);
  }

  async destroy(): Promise<void> {
    await this.page.evaluate(async () => {
      const core = (
        window as unknown as {xb?: {core?: {dispose(): Promise<void>}}}
      ).xb?.core;
      if (core) await core.dispose();
    });
  }
}
