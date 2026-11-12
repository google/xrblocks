import type {Page} from '@playwright/test';

import type {EdgeCardLayout, XRTestDriver} from '../drivers/types';
import {expect, test} from '../fixtures/boot';

/** Meters from the camera to the card, close enough for ~1 px per mm. */
const CARD_DISTANCE = 0.4;
/** RESIZE_CORNER_ARC_COLOR, #C5E0FE, as 8-bit sRGB. */
const ARC_COLOR = [0xc5, 0xe0, 0xfe] as const;
/** RESIZE_CORNER_ARC_GAP: arc radius past the card's corner radius. */
const ARC_GAP = 31;
/** Levels an opaque pixel may differ from its color after rasterization. */
const COLOR_TOLERANCE = 4;
/** Levels a pixel may differ from the arc color and still count as arc. */
const ARC_PIXEL_TOLERANCE = 24;
/** Levels an unlit pixel may change between frames. */
const UNCHANGED_TOLERANCE = 3;
/** Luma levels a lit rim pixel must gain over the unlit frame. */
const MIN_RIM_GAIN = 40;
/** Edge layout pixels scanned either side of the arc's centerline. */
const ARC_SCAN_HALF_WIDTH = 20;
/** Edge layout pixels between arc scan samples. */
const ARC_SCAN_STEP = 0.25;
/** Edge layout pixels from the cursor to the sampled rim and body points. */
const SAMPLE_OFFSET = 50;
/** Edge layout pixels inside the band's outer border, where it lights. */
const RIM_INSET = 6;
/** Edge layout pixels inside the card, on its body. */
const BODY_INSET = 30;
/** Hover point outside the card's top side, in edge layout pixels. */
const SIDE_HOVER_OUTSET = 40;
/** Hover point on the top-left resize corner, clear of the arc. */
const CORNER_HOVER = {along: 10, outset: 60};
/** Simulated milliseconds for fades and press transitions to settle. */
const SETTLE_MS = 300;

type Point = [number, number];
async function bootEdgeCard(
  driver: XRTestDriver,
  page: Page
): Promise<EdgeCardLayout> {
  await driver.boot('e2e/fixtures/apps/harness.html?edgeCard=1');
  await page.evaluate(
    (distance) => window.__e2e.edgeCard!.place(distance),
    CARD_DISTANCE
  );
  await driver.step(SETTLE_MS);
  return page.evaluate(() => window.__e2e.edgeCard!.layout());
}

/** Points the right hand's ray at an edge layout point. */
async function pointAt(page: Page, point: Point): Promise<void> {
  await page.evaluate(async ([x, y]) => {
    const {edgeCard, embodied} = window.__e2e;
    await embodied.pointTo(1, edgeCard!.worldPoint(x, y));
  }, point);
}

/** Renders a frame and returns the sRGB color of each edge layout point. */
function readPixels(page: Page, points: Point[]): Promise<number[][]> {
  return page.evaluate(
    (layoutPoints) => window.__e2e.edgeCard!.readPixels(layoutPoints),
    points
  );
}

function luma([r, g, b]: number[]): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function maxChannelDifference(a: readonly number[], b: readonly number[]) {
  return Math.max(...a.map((value, k) => Math.abs(value - b[k])));
}

/** Inner half size of the card, in edge layout pixels. */
function cardHalfSize({width, height, margin}: EdgeCardLayout): Point {
  return [width / 2 - margin, height / 2 - margin];
}

/** Top-left arc point at `radius` past the card's corner radius. */
function arcPoint(layout: EdgeCardLayout, radius: number): Point {
  const [halfWidth, halfHeight] = cardHalfSize(layout);
  const r = layout.cornerRadius;
  const along = (r + radius) * Math.SQRT1_2;
  return [-(halfWidth - r + along), halfHeight - r + along];
}

function cornerHover(layout: EdgeCardLayout): Point {
  const [halfWidth, halfHeight] = cardHalfSize(layout);
  return [-(halfWidth - CORNER_HOVER.along), halfHeight + CORNER_HOVER.outset];
}

/** Counts scan samples along the arc's diagonal that show the arc color. */
async function arcThickness(
  page: Page,
  layout: EdgeCardLayout
): Promise<number> {
  const points: Point[] = [];
  for (
    let offset = -ARC_SCAN_HALF_WIDTH;
    offset <= ARC_SCAN_HALF_WIDTH;
    offset += ARC_SCAN_STEP
  ) {
    points.push(arcPoint(layout, ARC_GAP + offset));
  }
  const pixels = await readPixels(page, points);
  return pixels.filter(
    (pixel) => maxChannelDifference(pixel, ARC_COLOR) <= ARC_PIXEL_TOLERANCE
  ).length;
}

test.describe('UICard edge', () => {
  test('draws a hovered resize corner arc in its opaque color', async ({
    driver,
    page,
  }) => {
    const layout = await bootEdgeCard(driver, page);
    const arc = arcPoint(layout, ARC_GAP);
    const [idle] = await readPixels(page, [arc]);
    expect(maxChannelDifference(idle, ARC_COLOR)).toBeGreaterThan(
      ARC_PIXEL_TOLERANCE
    );

    await pointAt(page, cornerHover(layout));
    await driver.step(SETTLE_MS);

    const [shown] = await readPixels(page, [arc]);
    expect(maxChannelDifference(shown, ARC_COLOR)).toBeLessThanOrEqual(
      COLOR_TOLERANCE
    );
  });

  test('lights the rim outside the card on side hover, not the card body', async ({
    driver,
    page,
  }) => {
    const layout = await bootEdgeCard(driver, page);
    const [halfWidth, halfHeight] = cardHalfSize(layout);
    expect(halfWidth).toBeGreaterThan(SAMPLE_OFFSET);
    // To the left of the cursor, clear of the right hand's ray.
    const rim: Point = [-SAMPLE_OFFSET, layout.height / 2 - RIM_INSET];
    const body: Point = [-SAMPLE_OFFSET, halfHeight - BODY_INSET];
    const [idleRim, idleBody] = await readPixels(page, [rim, body]);

    await pointAt(page, [0, halfHeight + SIDE_HOVER_OUTSET]);
    await driver.step(SETTLE_MS);

    const [litRim, litBody] = await readPixels(page, [rim, body]);
    expect(luma(litRim) - luma(idleRim)).toBeGreaterThan(MIN_RIM_GAIN);
    expect(maxChannelDifference(litBody, idleBody)).toBeLessThanOrEqual(
      UNCHANGED_TOLERANCE
    );
  });

  test('thins the corner arc while the corner is pressed', async ({
    driver,
    page,
  }) => {
    const layout = await bootEdgeCard(driver, page);
    await pointAt(page, cornerHover(layout));
    await driver.step(SETTLE_MS);
    const hovered = await arcThickness(page, layout);

    await driver.select('rightHand', true);
    await driver.step(SETTLE_MS);
    const pressed = await arcThickness(page, layout);

    expect(hovered).toBeGreaterThan(0);
    expect(pressed).toBeGreaterThan(0);
    expect(pressed).toBeLessThan(hovered);
    await driver.select('rightHand', false);
  });
});
