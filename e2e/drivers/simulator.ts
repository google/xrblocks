import type {Page} from '@playwright/test';
import type {
  CompoundControl,
  FrameStats,
  Hand,
  XRTestDriver,
  DriverState,
} from './types';

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
  }
}

const HAND_INDEX: Record<Hand, number> = {leftHand: 0, rightHand: 1};

/**
 * Drives the desktop simulator in a real browser page: `?xrAutomation=1`
 * boots the shared automation preset, `?debug=1` exposes `window.xb`, and
 * the in-page `EmbodiedControl` addon steps the core frame loop
 * deterministically.
 */
export class SimulatorDriver implements XRTestDriver {
  constructor(private readonly page: Page) {}

  /** Set by the boot fixture from the Playwright project name. */
  webgpu = false;

  async boot(appPath: string): Promise<void> {
    const base = process.env.E2E_BASE_URL;
    if (!base) {
      throw new Error('E2E_BASE_URL is not set (global setup did not run).');
    }
    const separator = appPath.includes('?') ? '&' : '?';
    await this.page.goto(
      `${base}/${appPath}${separator}debug=1&xrAutomation=1&webgpu=${this.webgpu ? 1 : 0}`
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
  }

  getState(): Promise<DriverState> {
    return this.page.evaluate(() => window.__e2e.state());
  }

  step(durationMs: number, control?: CompoundControl): Promise<void> {
    return this.page.evaluate(
      ([ms, ctl]) =>
        window.__e2e.embodied.step({
          durationMs: ms as number,
          control: ctl as CompoundControl | undefined,
        }),
      [durationMs, control ?? null] as const
    );
  }

  async pointTo(hand: Hand, objectName: string): Promise<void> {
    await this.page.evaluate(
      ([index, name]) =>
        window.__e2e.embodied.pointTo(
          index as number,
          window.__e2e.objects[name as string]
        ),
      [HAND_INDEX[hand], objectName] as const
    );
  }

  select(hand: Hand, press: boolean): Promise<void> {
    const control: CompoundControl = {
      [hand]: press ? {selectStart: true} : {selectEnd: true},
    };
    return this.step(50, control);
  }

  captureFrame(): Promise<FrameStats> {
    return this.page.evaluate(async () => {
      // Render synchronously first: without an explicit render the canvas
      // back buffer may already be cleared, and reads come back black.
      const core = (
        window as unknown as {
          xb?: {
            core?: {
              renderer: {
                render(scene: unknown, camera: unknown): unknown;
                setRenderTarget(target: null): void;
              };
              scene: unknown;
              camera: unknown;
            };
          };
        }
      ).xb?.core;
      const canvas = document.querySelector('canvas');
      if (!canvas) throw new Error('No canvas on page.');
      if (core) {
        core.renderer.setRenderTarget(null);
        await core.renderer.render(core.scene, core.camera);
      }
      const sample = document.createElement('canvas');
      sample.width = 160;
      sample.height = 90;
      const context = sample.getContext('2d');
      if (!context) throw new Error('No 2D context.');
      context.drawImage(canvas, 0, 0, sample.width, sample.height);
      const {data} = context.getImageData(0, 0, sample.width, sample.height);
      let nonBlack = 0;
      let lumaSum = 0;
      for (let i = 0; i < data.length; i += 4) {
        const luma =
          0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        lumaSum += luma;
        if (luma > 8) nonBlack += 1;
      }
      const samples = data.length / 4;
      return {
        nonBlackFraction: nonBlack / samples,
        meanLuma: lumaSum / samples,
        samples,
      };
    });
  }

  destroy(): Promise<void> {
    return this.page.evaluate(async () => {
      const core = (
        window as unknown as {xb?: {core?: {dispose(): Promise<void>}}}
      ).xb?.core;
      if (core) await core.dispose();
    });
  }
}
