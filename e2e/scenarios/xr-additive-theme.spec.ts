import type {Page} from '@playwright/test';

import {expect, test} from '../fixtures/boot';

const COLORFUL_SURFACE = 'rgba(10, 17, 31, 0.96)';
const ADDITIVE_SURFACE = '#173a3a';

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

  test('switches to additive theme and restores the app theme after session end', async ({
    driver,
    page,
  }) => {
    expect((await driver.getState()).lifecycle).not.toBe('disposed');
    await expect
      .poll(() => displayState(page))
      .toEqual({
        environmentBlendMode: 'additive',
        surface: ADDITIVE_SURFACE,
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

test.describe('IWER additive blend mode with app theming', () => {
  test.use({
    iwerOptions: {
      sessionMode: 'immersive-ar',
      environmentBlendMode: 'additive',
      autoAdditiveTheme: false,
      initialTheme: 'colorful',
    },
  });

  test('reports additive mode without changing the app theme', async ({
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
