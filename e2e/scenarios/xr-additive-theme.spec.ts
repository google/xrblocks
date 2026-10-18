import type {Page} from '@playwright/test';

import {expect, test} from '../fixtures/boot';

const COLORFUL_SURFACE = 'rgba(10, 17, 31, 0.96)';

type DisplayState = {
  environmentBlendMode: string | null;
  surface: string;
};

async function displayState(page: Page): Promise<DisplayState> {
  return page.evaluate(() => window.__e2e.displayState());
}

async function endSession(page: Page): Promise<void> {
  await page.evaluate(() => window.__e2e.endSession());
}

test.describe('IWER additive blend mode', () => {
  test.use({
    iwerOptions: {
      sessionMode: 'immersive-ar',
      environmentBlendMode: 'additive',
      initialTheme: 'colorful',
    },
  });

  test('exposes additive mode without changing the app theme', async ({
    driver,
    page,
  }) => {
    expect((await driver.getState()).lifecycle).not.toBe('disposed');
    await expect
      .poll(() => displayState(page))
      .toEqual({
        environmentBlendMode: 'additive',
        surface: COLORFUL_SURFACE,
      });

    await endSession(page);

    await expect
      .poll(() => displayState(page))
      .toEqual({
        environmentBlendMode: null,
        surface: COLORFUL_SURFACE,
      });
  });
});

test.describe('IWER alpha-blend mode', () => {
  test.use({
    iwerOptions: {
      sessionMode: 'immersive-ar',
      initialTheme: 'colorful',
    },
  });

  test('does not switch the app theme', async ({driver, page}) => {
    expect((await driver.getState()).lifecycle).not.toBe('disposed');
    await expect
      .poll(() => displayState(page))
      .toEqual({
        environmentBlendMode: 'alpha-blend',
        surface: COLORFUL_SURFACE,
      });
  });
});
