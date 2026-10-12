import {expect, type Page} from '@playwright/test';

export const DEMO_PATH = 'demos/session_replay/index.html';

type DemoWindow = {
  xb: {
    UIButton: new () => unknown;
    core: {
      simulatorRunning: boolean;
      scene: {traverse(fn: (object: DemoObject) => void): void};
      camera: {position: {clone(): unknown}};
      renderer: {domElement: HTMLCanvasElement};
      input: {mouseController: {userData: {connected: boolean}}};
    };
  };
};

type DemoObject = {
  label?: string;
  colorIndex?: number;
  position: {x: number};
  getWorldPosition(target: unknown): {
    x: number;
    y: number;
    z: number;
    project(camera: unknown): {x: number; y: number};
  };
};

export function demoUrl(): string {
  const base = process.env.E2E_BASE_URL;
  if (!base) {
    throw new Error('E2E_BASE_URL is not set (global setup did not run).');
  }
  return `${base}/${DEMO_PATH}?debug=1`;
}

/** Opens the demo in the desktop simulator and waits for its panel. */
export async function bootDemoInSimulator(page: Page): Promise<void> {
  await page.goto(demoUrl());
  await page.waitForFunction(
    () => (window as unknown as DemoWindow).xb?.core?.simulatorRunning === true,
    undefined,
    {timeout: 30_000}
  );
  // The panel is laid out once the Record button sits left of the card centre.
  await expect
    .poll(async () => (await buttonWorldX(page, 'Record')) ?? 0, {
      timeout: 20_000,
    })
    .toBeLessThan(-0.05);
}

async function buttonWorldX(page: Page, label: string) {
  return page.evaluate((label) => {
    const {xb} = window as unknown as DemoWindow;
    let x: number | undefined;
    xb.core.scene.traverse((object) => {
      if (object instanceof xb.UIButton && object.label === label) {
        x = object.getWorldPosition(xb.core.camera.position.clone()).x;
      }
    });
    return x;
  }, label);
}

/** Page coordinates of a 3D panel button's centre. */
export async function panelButtonCenter(page: Page, label: string) {
  const [point] = await projectObjects(page, {button: label});
  if (!point) throw new Error(`No panel button labelled ${label}.`);
  return point;
}

export async function clickPanelButton(page: Page, label: string) {
  const {x, y} = await panelButtonCenter(page, label);
  await page.mouse.click(x, y);
}

/** Page coordinates of each cube's centre. */
export function cubeCenters(page: Page) {
  return projectObjects(page, {cubes: true});
}

function projectObjects(
  page: Page,
  query: {button?: string; cubes?: boolean}
): Promise<{x: number; y: number}[]> {
  return page.evaluate((query) => {
    const {xb} = window as unknown as DemoWindow;
    const found: DemoObject[] = [];
    xb.core.scene.traverse((object) => {
      const isButton =
        object instanceof xb.UIButton && object.label === query.button;
      const isCube = query.cubes && typeof object.colorIndex === 'number';
      if (isButton || isCube) found.push(object);
    });
    const rect = xb.core.renderer.domElement.getBoundingClientRect();
    return found.map((object) => {
      const ndc = object
        .getWorldPosition(xb.core.camera.position.clone())
        .project(xb.core.camera);
      return {
        x: rect.left + ((ndc.x + 1) / 2) * rect.width,
        y: rect.top + ((1 - ndc.y) / 2) * rect.height,
      };
    });
  }, query);
}

export function isMouseConnected(page: Page): Promise<boolean> {
  return page.evaluate(
    () =>
      (window as unknown as DemoWindow).xb.core.input.mouseController.userData
        .connected
  );
}

/** Cube color indices, ordered left to right. */
export function cubeColors(page: Page): Promise<number[]> {
  return page.evaluate(() => {
    const {xb} = window as unknown as DemoWindow;
    const cubes: DemoObject[] = [];
    xb.core.scene.traverse((object) => {
      if (typeof object.colorIndex === 'number') cubes.push(object);
    });
    return cubes
      .sort((a, b) => a.position.x - b.position.x)
      .map((cube) => cube.colorIndex as number);
  });
}

export function toolbar(page: Page) {
  const bar = page.locator('body > div').filter({has: page.locator('input')});
  return {
    status: bar.locator('span'),
    record: bar.getByRole('button', {name: /^(Record|Stop)$/}),
    replay: bar.getByRole('button', {name: 'Replay'}),
    save: bar.getByRole('button', {name: 'Save'}),
    load: bar.getByRole('button', {name: 'Load'}),
    file: bar.locator('input[type=file]'),
  };
}

/** Pinches and releases the active simulator hand (Space toggles pinch). */
export async function pinch(page: Page) {
  await page.keyboard.press('Space');
  await page.waitForTimeout(250);
  await page.keyboard.press('Space');
  await page.waitForTimeout(250);
}

/** Clicks Save and returns the downloaded recording. */
export async function saveRecording(page: Page) {
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    toolbar(page).save.dispatchEvent('click'),
  ]);
  const path = await download.path();
  const {readFileSync} = await import('node:fs');
  return {
    name: download.suggestedFilename(),
    text: readFileSync(path, 'utf8'),
  };
}

export function loadRecording(page: Page, name: string, text: string) {
  return toolbar(page).file.setInputFiles({
    name,
    mimeType: 'application/json',
    buffer: Buffer.from(text),
  });
}
