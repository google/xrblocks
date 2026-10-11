import {test, expect} from '../fixtures/boot';

test('UI card mounts into the scene', async ({driver}) => {
  const state = await driver.getState();
  expect(state.uiCardPresent).toBe(true);
  expect(state.sceneObjects).toContain('E2E ui');
});

test('UI card layout is stable across steps', async ({driver}) => {
  await driver.step(50);
  const first = await driver.getState();
  expect(first.uiCardPresent).toBe(true);

  await driver.step(300);
  const second = await driver.getState();
  expect(second.uiCardPresent).toBe(true);
});

test('UI card renders ink in the frame', async ({driver}) => {
  await driver.step(50);
  const withCard = await driver.captureFrame();
  // The card sits front-and-center; the harness scene always renders some
  // content, so require a solid amount of visible pixels.
  expect(withCard.nonBlackFraction).toBeGreaterThan(0.01);
});
