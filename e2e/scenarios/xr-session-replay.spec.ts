import {test, expect, type Page} from '@playwright/test';
import {installEmulatedHeadset} from '../drivers/webxr';
import {
  bootDemoInSimulator,
  cubeColors,
  demoUrl,
  loadRecording,
  saveRecording,
  toolbar,
} from '../fixtures/session-replay';

// Records demos/session_replay in a real WebXR session (IWER's emulated
// Quest 3), the way a headset user would, then checks the saved file and
// replays it in the desktop simulator. IWER draws its own overlay over the
// page, so toolbar clicks are dispatched to the buttons directly.

type Vec3 = [number, number, number];

type IwerWindow = {
  xb: {
    core: {
      webXRSessionManager: {startSession(): Promise<void>};
      renderer: {
        xr: {
          isPresenting: boolean;
          getSession(): {end(): Promise<void>} | null;
        };
      };
      camera: {matrixWorld: {elements: number[]}};
    };
  };
  __xrDevice: {
    primaryInputMode: 'controller' | 'hand';
    controllers: Record<
      'left' | 'right',
      {
        position: {set(x: number, y: number, z: number): unknown};
        quaternion: {set(x: number, y: number, z: number, w: number): unknown};
        updateButtonValue(id: string, value: number): void;
      }
    >;
    hands: Record<'left' | 'right', {updatePinchValue(value: number): void}>;
  };
};

type SavedFrame = {
  t: number;
  head: number[];
  controllers: ({pose: number[]; selected: boolean} | null)[];
  hands: (number[] | null)[];
};

async function bootDemoWithHeadset(page: Page) {
  await installEmulatedHeadset(page);
  await page.goto(demoUrl());
  await expect(toolbar(page).record).toBeVisible({timeout: 30_000});
}

async function setPresenting(page: Page, presenting: boolean) {
  await page.evaluate(async (presenting) => {
    const {core} = (window as unknown as IwerWindow).xb;
    if (presenting) {
      await core.webXRSessionManager.startSession();
    } else {
      await core.renderer.xr.getSession()?.end();
    }
  }, presenting);
  await page.waitForFunction(
    (presenting) =>
      (window as unknown as IwerWindow).xb.core.renderer.xr.isPresenting ===
      presenting,
    presenting,
    {timeout: 20_000}
  );
}

async function bootDemoInXR(page: Page) {
  await bootDemoWithHeadset(page);
  await setPresenting(page, true);
}

/** Points the right controller straight ahead (-z) from `position`. */
async function moveRightController(page: Page, position: Vec3) {
  await page.evaluate((position) => {
    const controller = (window as unknown as IwerWindow).__xrDevice.controllers
      .right;
    controller.position.set(...position);
    controller.quaternion.set(0, 0, 0, 1);
  }, position);
  await page.waitForTimeout(250);
}

async function pressRightTrigger(page: Page) {
  for (const value of [1, 0]) {
    await page.evaluate(
      (value) =>
        (
          window as unknown as IwerWindow
        ).__xrDevice.controllers.right.updateButtonValue('trigger', value),
      value
    );
    await page.waitForTimeout(250);
  }
}

/** Records a controller sweep that ends with a trigger press on the right cube. */
async function recordControllerSession(page: Page) {
  const ui = toolbar(page);
  await moveRightController(page, [0.1, 1.4, -0.4]);
  await ui.record.dispatchEvent('click');
  await expect(ui.status).toHaveText('Recording...');
  await moveRightController(page, [0.3, 1.4, -0.4]);
  await pressRightTrigger(page);
  await ui.record.dispatchEvent('click');
  await expect(ui.status).toHaveText(/^\d+ frames, [\d.]+s from xr\.$/);
}

test('records controller poses and trigger presses', async ({page}) => {
  await bootDemoInXR(page);
  const start = await cubeColors(page);
  await recordControllerSession(page);
  const live = await cubeColors(page);
  // The trigger press landed on the right-hand cube.
  expect(live).toEqual([start[0], start[1], (start[2] + 1) % 4]);

  const saved = await saveRecording(page);
  const recording = JSON.parse(saved.text);
  expect(recording).toMatchObject({source: 'xr', state: start});
  const frames = recording.frames as SavedFrame[];
  const right = frames.map((frame) => frame.controllers[1]);
  expect(right.every((controller) => controller !== null)).toBe(true);
  expect(right.some((controller) => controller!.selected)).toBe(true);
  expect(right.at(-1)!.selected).toBe(false);
  // World poses: the controller moved 20cm along +x while recording.
  const xs = right.map((controller) => controller!.pose[0]);
  expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(0.2, 2);
});

test('records tracked hands with every joint', async ({page}) => {
  await bootDemoInXR(page);
  await page.evaluate(() => {
    (window as unknown as IwerWindow).__xrDevice.primaryInputMode = 'hand';
  });
  await page.waitForTimeout(300);

  const ui = toolbar(page);
  await ui.record.dispatchEvent('click');
  for (const value of [1, 0]) {
    await page.evaluate(
      (value) =>
        (
          window as unknown as IwerWindow
        ).__xrDevice.hands.right.updatePinchValue(value),
      value
    );
    await page.waitForTimeout(300);
  }
  await ui.record.dispatchEvent('click');

  const recording = JSON.parse((await saveRecording(page)).text);
  const frames = recording.frames as SavedFrame[];
  expect(frames.length).toBeGreaterThan(3);
  for (const side of [0, 1]) {
    expect(frames.every((frame) => frame.hands[side]?.length === 25 * 7)).toBe(
      true
    );
  }
  expect(frames.some((frame) => frame.controllers[1]?.selected)).toBe(true);
});

test('replay waits for the simulator in a real session', async ({page}) => {
  await bootDemoInXR(page);
  await recordControllerSession(page);
  const ui = toolbar(page);
  await ui.replay.dispatchEvent('click');
  await expect(ui.status).toHaveText(
    'Replay runs in the desktop simulator. Save this recording and load it there.'
  );

  // SessionPlayer itself refuses to drive a real session.
  const error = await page.evaluate(async () => {
    // Resolved by the demo's importmap.
    const addon = 'xrblocks/addons/session-replay/index.js';
    const {SessionPlayer} = await import(addon);
    const xb = (window as unknown as {xb: {add(object: unknown): void}}).xb;
    const player = new SessionPlayer();
    xb.add(player);
    // Scripts added after init are initialized on the next frame.
    for (let i = 0; i < 30 && !player.core; i++) {
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    try {
      await player.play({frames: [{t: 0}]});
      return 'resolved';
    } catch (e) {
      return (e as Error).message;
    }
  });
  expect(error).toBe('SessionPlayer replays into the desktop simulator.');
});

test('a recording saved in XR replays in the desktop simulator', async ({
  page,
  context,
}) => {
  await bootDemoInXR(page);
  await recordControllerSession(page);
  const live = await cubeColors(page);
  const saved = await saveRecording(page);
  const lastHead = (JSON.parse(saved.text).frames as SavedFrame[]).at(-1)!.head;

  // A fresh page has no emulated headset, so the demo opens the simulator.
  const desktop = await context.newPage();
  await bootDemoInSimulator(desktop);
  const ui = toolbar(desktop);
  await loadRecording(desktop, saved.name, saved.text);
  await expect(ui.status).toHaveText(/ from xr\.$/);
  await ui.replay.dispatchEvent('click');
  await expect(ui.status).toHaveText('Replay finished.', {timeout: 20_000});

  expect(await cubeColors(desktop)).toEqual(live);
  const camera = await desktop.evaluate(() =>
    (window as unknown as IwerWindow).xb.core.camera.matrixWorld.elements.slice(
      12,
      15
    )
  );
  camera.forEach((value, i) => expect(value).toBeCloseTo(lastHead[i], 3));
});

test('a recording started on the page keeps only the XR session', async ({
  page,
}) => {
  // On a headset the page toolbar is usable before entering XR.
  await bootDemoWithHeadset(page);
  const start = await cubeColors(page);
  const ui = toolbar(page);
  await ui.record.dispatchEvent('click');
  await expect(ui.status).toHaveText('Recording...');
  await page.waitForTimeout(500);

  await setPresenting(page, true);
  await moveRightController(page, [0.1, 1.4, -0.4]);
  await moveRightController(page, [0.3, 1.4, -0.4]);
  await pressRightTrigger(page);
  // Leaving XR without pressing Stop finishes the recording.
  await setPresenting(page, false);
  await expect(ui.status).toHaveText(/^\d+ frames, [\d.]+s from xr\.$/);
  await expect(ui.record).toHaveText('Record');

  const recording = JSON.parse((await saveRecording(page)).text);
  expect(recording).toMatchObject({source: 'xr', state: start});
  expect(recording).not.toHaveProperty('environment');
  const frames = recording.frames as SavedFrame[];
  expect(frames[0].t).toBe(0);
  // No page frames: the headset's controller is tracked from the first frame.
  expect(frames.every((frame) => frame.controllers[1] !== null)).toBe(true);
  expect(frames.some((frame) => frame.controllers[1]!.selected)).toBe(true);
});
