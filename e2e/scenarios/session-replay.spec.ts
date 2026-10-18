import {test, expect} from '@playwright/test';
import {
  activeRoom,
  bootDemoInSimulator,
  clickPanelButton,
  cubeCenters,
  cubeColors,
  isMouseConnected,
  loadRecording,
  panelButtonCenter,
  pinch,
  saveRecording,
  switchRoom,
  toolbar,
} from '../fixtures/session-replay';

// Drives demos/session_replay like a desktop user: mouse on the 3D panel,
// Space to pinch, and the page toolbar for files. The demo does not read the
// webgpu flag, so one project covers it.
test.beforeEach(async ({page}, info) => {
  test.skip(
    info.project.name !== 'sim-webgl',
    'The demo renders the same in both simulator projects.'
  );
  await bootDemoInSimulator(page);
});

test('replays hand pinches into the recorded starting state', async ({
  page,
}) => {
  const ui = toolbar(page);
  await expect(ui.replay).toBeDisabled();
  await expect(ui.save).toBeDisabled();

  await clickPanelButton(page, 'Record');
  await expect(ui.status).toHaveText('Recording...');
  await expect(ui.record).toHaveText('Stop');
  const start = await cubeColors(page);
  await pinch(page);
  await pinch(page);
  await page.waitForTimeout(2000);
  await clickPanelButton(page, 'Stop');
  await expect(ui.status).toHaveText(/^\d+ frames, [\d.]+s from simulator\.$/);
  const live = await cubeColors(page);
  expect(live).not.toEqual(start);

  await clickPanelButton(page, 'Replay');
  await expect(ui.status).toHaveText('Replaying...');
  // Replay first restores the colors stored at Record.
  await expect(ui.status).toHaveText('Replay finished.', {timeout: 20_000});
  expect(await cubeColors(page)).toEqual(live);
});

test('locks the panel while a replay is running', async ({page}) => {
  const ui = toolbar(page);
  await ui.record.click();
  await pinch(page);
  // Long enough that the checks below run while the replay is still going.
  await page.waitForTimeout(3000);
  await ui.record.click();

  await ui.replay.click();
  await expect(ui.status).toHaveText('Replaying...');
  await expect(ui.record).toBeDisabled();
  await expect(ui.replay).toBeDisabled();
  await expect(ui.load).toBeDisabled();
  await clickPanelButton(page, 'Record');
  await expect(ui.status).toHaveText('Replaying...');
  await expect(ui.record).toHaveText('Record');

  await expect(ui.status).toHaveText('Replay finished.', {timeout: 20_000});
  await expect(ui.record).toBeEnabled();
  await expect(ui.replay).toBeEnabled();
});

test('ignores drags across the panel and mouse clicks on cubes', async ({
  page,
}) => {
  const ui = toolbar(page);
  const {x, y} = await panelButtonCenter(page, 'Record');
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x + 60, y + 10, {steps: 6});
  await page.mouse.up();
  await page.waitForTimeout(300);
  await expect(ui.record).toHaveText('Record');

  // Only hands are recorded, so the mouse must not change the scene.
  const before = await cubeColors(page);
  for (const cube of await cubeCenters(page)) {
    await page.mouse.click(cube.x, cube.y);
    // A click holds the mouse controller for a few frames; the demo ignores
    // clicks until it is released, which takes a while on slow renderers.
    await expect.poll(() => isMouseConnected(page)).toBe(false);
  }
  expect(await cubeColors(page)).toEqual(before);
});

test('saves a recording that loads and replays after a reload', async ({
  page,
}) => {
  const ui = toolbar(page);
  await ui.record.click();
  await pinch(page);
  await ui.record.click();
  const live = await cubeColors(page);
  const saved = await saveRecording(page);

  expect(saved.name).toMatch(/\.json$/);
  const recording = JSON.parse(saved.text);
  expect(recording).toMatchObject({
    format: 'xrblocks-session',
    version: 1,
    source: 'simulator',
    state: [0, 0, 0],
  });
  expect(recording.jointNames).toHaveLength(25);
  const frames = recording.frames as {
    hands: (number[] | null)[];
    controllers: ({selected: boolean} | null)[];
  }[];
  // The first frame and each selection change are always written.
  expect(frames.length).toBeGreaterThanOrEqual(3);
  expect(frames.some((f) => f.hands[0]?.length === 25 * 7)).toBe(true);
  expect(frames.some((f) => f.controllers[0]?.selected)).toBe(true);

  await page.reload();
  await bootDemoInSimulator(page);
  await expect(ui.replay).toBeDisabled();
  await loadRecording(page, saved.name, saved.text);
  await expect(ui.status).toHaveText(
    new RegExp(`^${frames.length} frames, [\\d.]+s from simulator\\.$`)
  );
  await expect(ui.replay).toBeEnabled();
  await ui.replay.click();
  await expect(ui.status).toHaveText('Replay finished.', {timeout: 20_000});
  expect(await cubeColors(page)).toEqual(live);
});

test('reports invalid files and keeps the current recording', async ({
  page,
}) => {
  const ui = toolbar(page);
  await loadRecording(page, 'broken.json', '{"format":"something-else"}');
  await expect(ui.status).toHaveText(
    'Invalid session recording: format must be "xrblocks-session".'
  );
  await expect(ui.replay).toBeDisabled();

  await loadRecording(page, 'garbage.json', 'not json');
  await expect(ui.status).toHaveText(/JSON/);

  await ui.record.click();
  await pinch(page);
  await ui.record.click();
  await expect(ui.replay).toBeEnabled();
  await loadRecording(page, 'broken.json', '[]');
  await expect(ui.status).toHaveText(/^Invalid session recording/);
  await expect(ui.replay).toBeEnabled();
  await ui.replay.click();
  await expect(ui.status).toHaveText('Replay finished.', {timeout: 20_000});
});

test('disables replay for a recording with no frames', async ({page}) => {
  const ui = toolbar(page);
  const jointNames = await page.evaluate(
    () =>
      (window as unknown as {xb: {HAND_JOINT_NAMES: string[]}}).xb
        .HAND_JOINT_NAMES
  );
  await loadRecording(
    page,
    'empty.json',
    JSON.stringify({
      format: 'xrblocks-session',
      version: 1,
      source: 'xr',
      jointNames,
      frames: [],
    })
  );
  await expect(ui.status).toHaveText('0 frames, 0.0s from xr.');
  await expect(ui.replay).toBeDisabled();
  await expect(ui.save).toBeEnabled();
});

test('replays in the room it was recorded in', async ({page}) => {
  const ui = toolbar(page);
  const recordedIn = await activeRoom(page);
  await ui.record.click();
  await pinch(page);
  await ui.record.click();
  const saved = await saveRecording(page);
  expect(JSON.parse(saved.text).environment.name).toBe(recordedIn);

  const other = recordedIn === 'Office' ? 'Living Room' : 'Office';
  await switchRoom(page, other);
  expect(await activeRoom(page)).toBe(other);
  await loadRecording(page, saved.name, saved.text);
  await ui.replay.click();
  await expect(ui.status).toHaveText('Replay finished.', {timeout: 30_000});
  expect(await activeRoom(page)).toBe(recordedIn);
});

test('names a custom room that cannot be loaded', async ({page}) => {
  const ui = toolbar(page);
  const roomBefore = await activeRoom(page);
  await ui.record.click();
  await pinch(page);
  await ui.record.click();
  const saved = JSON.parse((await saveRecording(page)).text);
  saved.environment = {name: 'My loft', manifestPath: 'missing/loft.json'};

  await loadRecording(page, 'loft.json', JSON.stringify(saved));
  await ui.replay.click();
  await expect(ui.status).toHaveText(
    /^Could not load the recorded simulator room "My loft": .*404.* Pass \{environment: false\}/
  );
  await expect(ui.replay).toBeEnabled();
  expect(await activeRoom(page)).toBe(roomBefore);
});
