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

  constructor(private readonly page: Page) {}

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
    await this.page.addInitScript(() => {
      const iwer = (
        globalThis as unknown as {
          IWER: {
            XRDevice: new (config: unknown) => unknown;
            metaQuest3: unknown;
          };
        }
      ).IWER;
      const device = new iwer.XRDevice(iwer.metaQuest3);
      // forceInstall: 127.0.0.1 is a secure context, so Chromium exposes its
      // native navigator.xr (which reports no headset). The emulated runtime
      // must replace it.
      (
        device as unknown as {
          installRuntime(options?: {forceInstall?: boolean}): void;
        }
      ).installRuntime({forceInstall: true});
      (globalThis as Record<string, unknown>).__xrDevice = device;
    });
    // No xrAutomation: the simulator must stay out of the way.
    const separator = appPath.includes('?') ? '&' : '?';
    await this.page.goto(`${base}/${appPath}${separator}debug=1&xr=1`);
    await this.page.waitForFunction(
      () =>
        typeof window !== 'undefined' &&
        'xb' in window &&
        Boolean(window.__e2e),
      undefined,
      {timeout: 30_000}
    );
    await this.page.evaluate(() => window.__e2e.ready);
    // Enter immersive VR through the SDK's own session manager.
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
