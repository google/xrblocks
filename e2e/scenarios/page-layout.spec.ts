import {test, expect} from '../fixtures/boot';

test('canvas fills the viewport with no page margins', async ({
  driver,
  page,
}) => {
  const layout = await page.evaluate(() => {
    const canvas = document.querySelector('canvas');
    if (!canvas) throw new Error('No canvas on page.');
    const rect = canvas.getBoundingClientRect();
    return {
      rect: {x: rect.x, y: rect.y, width: rect.width, height: rect.height},
      viewport: {width: window.innerWidth, height: window.innerHeight},
      scroll: {
        width: document.documentElement.scrollWidth,
        height: document.documentElement.scrollHeight,
      },
    };
  });

  // A body margin/padding leak (e.g. the default 8px margin) shows up as a
  // white line along the top/left borders of the page.
  expect(layout.rect.x).toBe(0);
  expect(layout.rect.y).toBe(0);
  expect(layout.rect.width).toBe(layout.viewport.width);
  expect(layout.rect.height).toBe(layout.viewport.height);
  expect(layout.scroll.width).toBe(layout.viewport.width);
  expect(layout.scroll.height).toBe(layout.viewport.height);
});
