import {test, expect} from '../fixtures/boot';
import {IwerDriver} from '../drivers/webxr';

test('a transient-pointer pinch clicks a UI button when released between frames', async ({
  driver,
  page,
}) => {
  await (driver as IwerDriver).pinchTransientButton('buttonA');

  const clicks = await page.evaluate(() => window.__e2e.buttonClicks());
  expect(clicks).toEqual({a: 1, b: 0});
});

test('a transient-pointer release is kept on A before its slot starts a pinch on B', async ({
  driver,
  page,
}) => {
  const result = await (
    driver as IwerDriver
  ).pinchTransientButtonsWithSlotReuse();

  expect(result.afterReuse).toEqual({
    clicks: {a: 1, b: 0},
    buttonBSelecting: true,
  });
  expect(result.afterButtonBRelease).toEqual({a: 1, b: 1});
  expect(await page.evaluate(() => window.__e2e.buttonClicks())).toEqual({
    a: 1,
    b: 1,
  });
});
