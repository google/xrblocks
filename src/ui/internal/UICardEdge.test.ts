import * as THREE from 'three';
import {describe, expect, it} from 'vitest';

import {
  UICardEdge,
  isCornerHit,
  isOuterEdgeHit,
  outerBandDistance,
} from './UICardEdge';

// A 400x200 card with a 50px band gives a 500x300 edge layer.
const SIZE = [500, 300] as const;
const MARGIN = 50;
// The same card with the default 87px band.
const DEFAULT_MARGIN = 87;
const DEFAULT_SIZE = [574, 374] as const;

function uv(
  x: number,
  y: number,
  size: readonly [number, number] = SIZE
): THREE.Vector2 {
  return new THREE.Vector2(x / size[0] + 0.5, y / size[1] + 0.5);
}

/** World point at layout pixel (x, y) from the center of an untransformed edge. */
function point(x: number, y: number): THREE.Vector3 {
  return new THREE.Vector3(x / SIZE[0], y / SIZE[1], 0);
}

function createEdge(resizable = true): UICardEdge {
  const edge = new UICardEdge({
    margin: MARGIN,
    cardCornerRadius: 24,
    resizable,
  });
  edge.size.value = [...SIZE];
  return edge;
}

function uniform(edge: UICardEdge, name: string) {
  return edge.material.uniforms[name].value;
}

describe('isCornerHit', () => {
  it('reaches 45 mm along each side from the card edge, like Android XR', () => {
    expect(isCornerHit(uv(240, 140), SIZE, MARGIN, 24)).toBe(true);
    expect(isCornerHit(uv(-240, -140), SIZE, MARGIN, 24)).toBe(true);
    // 50px band + 45px along the side = 95px from the outer edge.
    expect(isCornerHit(uv(250 - 90, 140), SIZE, MARGIN, 24)).toBe(true);
    expect(isCornerHit(uv(250 - 100, 140), SIZE, MARGIN, 24)).toBe(false);
  });

  it('still covers a rounded corner larger than 45 mm', () => {
    expect(isCornerHit(uv(250 - 125, 140), SIZE, MARGIN, 80)).toBe(true);
    expect(isCornerHit(uv(250 - 135, 140), SIZE, MARGIN, 80)).toBe(false);
  });

  it('leaves the middle of every side for translation', () => {
    expect(isCornerHit(uv(0, 140), SIZE, MARGIN, 24)).toBe(false);
    expect(isCornerHit(uv(240, 0), SIZE, MARGIN, 24)).toBe(false);
    // A large radius is capped at half of each side of the card.
    expect(isCornerHit(uv(240, 40), SIZE, MARGIN, 500)).toBe(false);
    expect(isCornerHit(uv(240, 60), SIZE, MARGIN, 500)).toBe(true);
  });

  it('keeps 45 mm corners on a short card with the default band', () => {
    const hit = (x: number, y: number) =>
      isCornerHit(uv(x, y, DEFAULT_SIZE), DEFAULT_SIZE, DEFAULT_MARGIN, 24);
    // Along the 400 mm side and the 200 mm side, 45 mm from the card corner.
    expect(hit(160, 186)).toBe(true);
    expect(hit(150, 186)).toBe(false);
    expect(hit(286, 60)).toBe(true);
    expect(hit(286, 50)).toBe(false);
  });
});

describe('isOuterEdgeHit', () => {
  it('accepts the outer band and rejects the hollow interior', () => {
    expect(isOuterEdgeHit(uv(0, 120), SIZE, MARGIN, 24)).toBe(true);
    expect(isOuterEdgeHit(uv(0, 0), SIZE, MARGIN, 24)).toBe(false);
    expect(isOuterEdgeHit(uv(0, 95), SIZE, MARGIN, 24)).toBe(false);
    expect(isOuterEdgeHit(uv(0, 95), SIZE, MARGIN, 24, 10)).toBe(true);
  });

  it('reaches 87 mm outside the card by default, like Android XR', () => {
    const edge = new UICardEdge();
    expect(edge.margin).toBe(DEFAULT_MARGIN);
    const hit = (x: number, y: number) =>
      isOuterEdgeHit(uv(x, y, DEFAULT_SIZE), DEFAULT_SIZE, edge.margin, 24);
    expect(hit(0, 100 + 86)).toBe(true);
    expect(hit(200 + 86, 0)).toBe(true);
    expect(hit(0, 100 + 88)).toBe(false);
    expect(hit(0, 100 - 1)).toBe(false);
    // Near the corner, the band reaches as far and resizes.
    expect(hit(180, 100 + 86)).toBe(true);
    expect(
      isCornerHit(uv(180, 186, DEFAULT_SIZE), DEFAULT_SIZE, edge.margin, 24)
    ).toBe(true);
  });

  it('squares the outer corners so the whole corner tip responds, like Android XR', () => {
    const hit = (x: number, y: number, padding = 0) =>
      isOuterEdgeHit(
        uv(x, y, DEFAULT_SIZE),
        DEFAULT_SIZE,
        DEFAULT_MARGIN,
        24,
        padding
      );
    // 85 mm out from the side and 70 mm out from the top at the same time.
    expect(hit(200 + 85, 100 + 70)).toBe(true);
    expect(hit(200 + 86, 100 + 86)).toBe(true);
    expect(hit(-286, -186)).toBe(true);
    expect(
      isCornerHit(uv(285, 170, DEFAULT_SIZE), DEFAULT_SIZE, DEFAULT_MARGIN, 24)
    ).toBe(true);
    // Past the band on either axis still misses.
    expect(hit(200 + 88, 100 + 70)).toBe(false);
    expect(hit(200 + 85, 100 + 88)).toBe(false);
    expect(hit(200 + 88, 100 + 88)).toBe(false);
    expect(hit(200 + 88, 100 + 88, 2)).toBe(true);
  });

  it('keeps the inner boundary on the card rounded corner', () => {
    // The 24 mm card corner is centered at (176, 76).
    const hit = (x: number, y: number) =>
      isOuterEdgeHit(uv(x, y, DEFAULT_SIZE), DEFAULT_SIZE, DEFAULT_MARGIN, 24);
    expect(hit(195, 95)).toBe(true);
    expect(hit(190, 90)).toBe(false);
    expect(hit(199, 50)).toBe(false);
    expect(hit(201, 50)).toBe(true);
  });
});

describe('outerBandDistance', () => {
  it('measures how far outside the card a band hit is', () => {
    // The card's own half-size is 250 - 50 = 200 by 150 - 50 = 100 px.
    expect(outerBandDistance(uv(245, 0), SIZE, MARGIN)).toBeCloseTo(45);
    expect(outerBandDistance(uv(-210, 20), SIZE, MARGIN)).toBeCloseTo(10);
    expect(outerBandDistance(uv(0, 140), SIZE, MARGIN)).toBeCloseTo(40);
    expect(outerBandDistance(uv(230, 130), SIZE, MARGIN)).toBeCloseTo(30);
    // In the square corner tip, the farther of the two outward distances.
    expect(outerBandDistance(uv(248, 140), SIZE, MARGIN)).toBeCloseTo(48);
    expect(outerBandDistance(uv(-235, -149), SIZE, MARGIN)).toBeCloseTo(49);
  });
});

describe('UICardEdge glow uniforms', () => {
  it('drops the old spotlight and outline settings', () => {
    const uniforms = createEdge().material.uniforms;
    expect(uniforms.u_cursor_radius).toBeUndefined();
    expect(uniforms.u_cursor_spotlight_blur).toBeUndefined();
    expect(uniforms.u_edge_width).toBeUndefined();
  });
});

describe('UICardEdge side glow', () => {
  it('fades in and out linearly over 90 ms, in place', () => {
    const edge = createEdge();
    edge.setCursorPoints(point(0, 140));
    expect(uniform(edge, 'u_show_glow')).toBe(0);
    expect(uniform(edge, 'u_cursor_uv').toArray()).toEqual([
      0.5,
      140 / 300 + 0.5,
    ]);

    edge.update(0.045);
    expect(uniform(edge, 'u_show_glow')).toBeCloseTo(0.5);
    expect(edge.material.visible).toBe(true);
    edge.update(0.05);
    expect(uniform(edge, 'u_show_glow')).toBe(1);
    edge.update(1 / 60);
    expect(uniform(edge, 'u_show_glow')).toBe(1);

    edge.setCursorPoints();
    expect(uniform(edge, 'u_show_glow')).toBe(1);
    edge.update(0.045);
    expect(uniform(edge, 'u_show_glow')).toBeCloseTo(0.5);
    expect(uniform(edge, 'u_cursor_uv').toArray()).toEqual([
      0.5,
      140 / 300 + 0.5,
    ]);
    expect(edge.material.visible).toBe(true);
    edge.update(0.05);
    expect(uniform(edge, 'u_show_glow')).toBe(0);
    expect(edge.material.visible).toBe(false);
  });
});

describe('UICardEdge resize corner arc', () => {
  it('shows the arc instantly on a resize corner without the glow', () => {
    const edge = createEdge();
    edge.setCursorPoints(point(-225, 125));

    expect(uniform(edge, 'u_show_glow')).toBe(0);
    expect(uniform(edge, 'u_corner_sign').toArray()).toEqual([-1, 1]);
    expect(uniform(edge, 'u_corner_alpha')).toBe(1);
    expect(edge.material.visible).toBe(true);

    // Hovering the corner keeps the arc steady rather than flickering.
    edge.update(1 / 60);
    expect(uniform(edge, 'u_corner_alpha')).toBe(1);
    edge.update(1);
    expect(uniform(edge, 'u_corner_alpha')).toBe(1);
    expect(uniform(edge, 'u_show_glow')).toBe(0);

    edge.setCursorPoints();
    expect(uniform(edge, 'u_corner_alpha')).toBe(0);
    expect(edge.material.visible).toBe(false);
  });

  it('cuts the side glow, waits, then shows the arc when moving to a corner', () => {
    const edge = createEdge();
    edge.setCursorPoints(point(0, 140));
    edge.update(1);

    edge.setCursorPoints(point(225, -125));
    expect(uniform(edge, 'u_corner_alpha')).toBe(0);
    expect(uniform(edge, 'u_show_glow')).toBe(1);
    // The glow is cut over 30 ms, where it was rather than onto the corner.
    edge.update(0.015);
    expect(uniform(edge, 'u_show_glow')).toBeCloseTo(0.5);
    expect(uniform(edge, 'u_corner_alpha')).toBe(0);
    expect(uniform(edge, 'u_cursor_uv').toArray()).toEqual([
      0.5,
      140 / 300 + 0.5,
    ]);
    edge.update(0.015);
    expect(uniform(edge, 'u_show_glow')).toBe(0);
    expect(uniform(edge, 'u_corner_alpha')).toBe(0);
    expect(edge.material.visible).toBe(false);

    // Then nothing for 80 ms, and the arc appears at once.
    edge.update(0.079);
    expect(uniform(edge, 'u_corner_alpha')).toBe(0);
    expect(edge.material.visible).toBe(false);
    edge.update(0.002);
    expect(uniform(edge, 'u_corner_alpha')).toBe(1);
    expect(uniform(edge, 'u_corner_sign').toArray()).toEqual([1, -1]);
    expect(uniform(edge, 'u_show_glow')).toBe(0);
    expect(edge.material.visible).toBe(true);
  });

  it('times the side to corner handoff across long frames', () => {
    const edge = createEdge();
    edge.setCursorPoints(point(0, 140));
    edge.update(1);
    edge.setCursorPoints(point(225, -125));
    // 30 ms cut plus 80 ms gap.
    edge.update(0.1);
    expect(uniform(edge, 'u_show_glow')).toBe(0);
    expect(uniform(edge, 'u_corner_alpha')).toBe(0);
    edge.update(0.02);
    expect(uniform(edge, 'u_corner_alpha')).toBe(1);
  });

  it('hides the arc at once, waits, then fades the glow in when moving to a side', () => {
    const edge = createEdge();
    edge.setCursorPoints(point(225, -125));
    edge.update(1);

    edge.setCursorPoints(point(0, 140));
    expect(uniform(edge, 'u_corner_alpha')).toBe(0);
    expect(uniform(edge, 'u_show_glow')).toBe(0);
    expect(edge.material.visible).toBe(false);
    edge.update(0.079);
    expect(uniform(edge, 'u_show_glow')).toBe(0);
    expect(uniform(edge, 'u_corner_alpha')).toBe(0);
    expect(edge.material.visible).toBe(false);

    // After the 80 ms gap, the glow fades in over the usual 90 ms.
    edge.update(0.046);
    expect(uniform(edge, 'u_show_glow')).toBeCloseTo(0.5);
    expect(uniform(edge, 'u_cursor_uv').toArray()).toEqual([
      0.5,
      140 / 300 + 0.5,
    ]);
    expect(edge.material.visible).toBe(true);
    edge.update(0.045);
    expect(uniform(edge, 'u_show_glow')).toBeCloseTo(1);
    edge.update(0.01);
    expect(uniform(edge, 'u_show_glow')).toBe(1);
    expect(uniform(edge, 'u_corner_alpha')).toBe(0);
  });

  it('settles to nothing when leaving the band during a handoff', () => {
    const edge = createEdge();
    edge.setCursorPoints(point(0, 140));
    edge.update(1);
    edge.setCursorPoints(point(225, -125));
    edge.update(0.05);
    edge.setCursorPoints(point(0, 0));
    edge.update(1);
    expect(uniform(edge, 'u_show_glow')).toBe(0);
    expect(uniform(edge, 'u_corner_alpha')).toBe(0);
    expect(edge.material.visible).toBe(false);
    // Coming back from the card is not a handoff, so the glow fades in now.
    edge.setCursorPoints(point(0, 140));
    edge.update(0.045);
    expect(uniform(edge, 'u_show_glow')).toBeCloseTo(0.5);

    edge.setCursorPoints(point(225, -125));
    edge.update(1);
    edge.setCursorPoints(point(0, 140));
    edge.update(0.04);
    edge.setCursorPoints();
    edge.update(1);
    expect(uniform(edge, 'u_show_glow')).toBe(0);
    expect(edge.material.visible).toBe(false);
    // Entering a corner from outside shows its arc at once.
    edge.setCursorPoints(point(225, 125));
    expect(uniform(edge, 'u_corner_alpha')).toBe(1);
  });

  it('skips the gap when returning before the other affordance appears', () => {
    const edge = createEdge();
    edge.setCursorPoints(point(225, -125));
    edge.update(1);
    // Back on the corner before the side glow appeared: the arc returns.
    edge.setCursorPoints(point(0, 140));
    edge.update(0.04);
    edge.setCursorPoints(point(225, -125));
    expect(uniform(edge, 'u_corner_alpha')).toBe(1);

    // Back on the side before the arc appeared: the glow fades in again.
    edge.setCursorPoints(point(0, 140));
    edge.update(1);
    edge.setCursorPoints(point(225, -125));
    edge.update(0.06);
    edge.setCursorPoints(point(0, 140));
    edge.update(0.045);
    expect(uniform(edge, 'u_show_glow')).toBeCloseTo(0.5);
    expect(uniform(edge, 'u_corner_alpha')).toBe(0);
  });

  it('keeps the grabbed corner lit while held, even off the band', () => {
    const edge = createEdge();
    edge.setCursorPoints(point(225, 125));
    edge.update(1);
    // Pressing keeps the corner, wherever the pointer goes while held.
    edge.setCursorPoints(point(225, 125), undefined, true);
    edge.update(1);

    edge.setCursorPoints(point(0, 140), undefined, true);
    edge.update(1);
    expect(uniform(edge, 'u_corner_alpha')).toBe(1);
    expect(uniform(edge, 'u_corner_sign').toArray()).toEqual([1, 1]);
    expect(uniform(edge, 'u_show_glow')).toBe(0);

    edge.setCursorPoints(point(0, 0), undefined, true);
    edge.update(1);
    expect(uniform(edge, 'u_corner_alpha')).toBe(1);
    expect(uniform(edge, 'u_show_glow')).toBe(0);

    edge.setCursorPoints(point(0, 0));
    expect(uniform(edge, 'u_corner_alpha')).toBe(0);
    edge.update(1);
    expect(uniform(edge, 'u_corner_alpha')).toBe(0);
    expect(edge.material.visible).toBe(false);
  });

  it('keeps the glow and no arc while dragging from a side', () => {
    const edge = createEdge();
    edge.setCursorPoints(point(0, 140));
    edge.update(1);
    edge.setCursorPoints(point(0, 140), undefined, true);
    edge.update(1);
    edge.setCursorPoints(point(225, 125), undefined, true);
    edge.update(1);
    expect(uniform(edge, 'u_corner_alpha')).toBe(0);
    expect(uniform(edge, 'u_corner_press')).toBe(0);
    expect(uniform(edge, 'u_show_glow')).toBe(1);
  });

  it('tracks a second pointer in its own slot', () => {
    const edge = createEdge();
    edge.setCursorPoints(point(0, 140), point(-225, -125));
    expect(uniform(edge, 'u_corner_alpha_2')).toBe(1);
    edge.update(1);
    expect(uniform(edge, 'u_show_glow')).toBe(1);
    expect(uniform(edge, 'u_corner_alpha')).toBe(0);
    expect(uniform(edge, 'u_show_glow_2')).toBe(0);
    expect(uniform(edge, 'u_corner_sign_2').toArray()).toEqual([-1, -1]);
    expect(uniform(edge, 'u_corner_alpha_2')).toBe(1);
  });

  it('times each pointer slot handoff on its own', () => {
    const edge = createEdge();
    edge.setCursorPoints(point(225, -125));
    edge.update(1);
    edge.setCursorPoints(point(0, 140), point(-225, 125));
    expect(uniform(edge, 'u_corner_alpha')).toBe(0);
    expect(uniform(edge, 'u_corner_alpha_2')).toBe(1);
    expect(edge.material.visible).toBe(true);
    edge.update(0.05);
    expect(uniform(edge, 'u_show_glow')).toBe(0);
    expect(uniform(edge, 'u_corner_alpha_2')).toBe(1);
    edge.update(0.075);
    expect(uniform(edge, 'u_show_glow')).toBeCloseTo(0.5);
    expect(uniform(edge, 'u_show_glow_2')).toBe(0);
  });

  it('resizes from the square corner tip outside the rounded band', () => {
    const edge = createEdge();
    // Beyond the old 74px rounded outer corner centered at (176, 76).
    const tip = point(248, 148);
    expect(edge.containsPoint(tip)).toBe(true);
    expect(edge.touchTarget(tip)).toBe(edge.resizeHandle);
    edge.setCursorPoints(tip);
    expect(uniform(edge, 'u_show_glow')).toBe(0);
    expect(uniform(edge, 'u_corner_sign').toArray()).toEqual([1, 1]);
    expect(uniform(edge, 'u_corner_alpha')).toBe(1);

    expect(edge.containsPoint(point(252, 148))).toBe(false);
    expect(edge.containsPoint(point(248, 152))).toBe(false);
    expect(edge.touchTarget(point(252, 148))).toBeUndefined();
  });

  it('moves from the square corner tip of an edge that does not resize', () => {
    const edge = createEdge(false);
    const tip = point(-248, 148);
    expect(edge.containsPoint(tip)).toBe(true);
    expect(edge.touchTarget(tip)).toBeUndefined();
    edge.setCursorPoints(tip);
    edge.update(1);
    expect(uniform(edge, 'u_show_glow')).toBe(1);
    expect(uniform(edge, 'u_corner_alpha')).toBe(0);
  });

  it('only glows on the corners of an edge that does not resize', () => {
    const edge = createEdge(false);
    edge.setCursorPoints(point(225, 125));
    edge.update(1);
    expect(uniform(edge, 'u_show_glow')).toBe(1);
    expect(uniform(edge, 'u_corner_alpha')).toBe(0);
  });

  it('shows nothing while pointing at the card itself, even near a corner', () => {
    const edge = createEdge();
    // Inside the 400x200 card, just in from its top-right corner.
    edge.setCursorPoints(point(185, 85));
    edge.update(1);
    expect(uniform(edge, 'u_show_glow')).toBe(0);
    expect(uniform(edge, 'u_corner_alpha')).toBe(0);
    expect(edge.material.visible).toBe(false);
  });

  it('stays hittable while it draws nothing', () => {
    const edge = createEdge();
    // UIKit shows a laid-out edge. Rays skip invisible objects, so the band
    // must stay visible to be found before anything points at it.
    edge.visible = true;
    edge.setCursorPoints();
    expect(edge.visible).toBe(true);
    expect(edge.material.visible).toBe(false);

    edge.setCursorPoints(point(0, 140));
    edge.update(1);
    expect(edge.material.visible).toBe(true);
    edge.setCursorPoints();
    edge.update(1);
    expect(edge.visible).toBe(true);
    expect(edge.material.visible).toBe(false);
  });
});

describe('UICardEdge press states', () => {
  const sideUV = [0.5, 140 / 300 + 0.5];

  function hoverSide(edge: UICardEdge) {
    edge.setCursorPoints(point(0, 140));
    edge.update(1);
  }

  it('shortens and tints a pressed side over 70 and 300 ms', () => {
    const edge = createEdge();
    hoverSide(edge);
    expect(uniform(edge, 'u_glow_press_length')).toBe(0);
    expect(uniform(edge, 'u_glow_press_fill')).toBe(0);

    edge.setCursorPoints(point(0, 140), undefined, true);
    edge.update(0.035);
    expect(uniform(edge, 'u_glow_press_length')).toBeCloseTo(0.5);
    expect(uniform(edge, 'u_glow_press_fill')).toBeCloseTo(0.035 / 0.3);
    edge.update(0.035);
    expect(uniform(edge, 'u_glow_press_length')).toBeCloseTo(1);
    edge.update(0.001);
    expect(uniform(edge, 'u_glow_press_length')).toBe(1);
    expect(uniform(edge, 'u_glow_press_fill')).toBeLessThan(1);
    edge.update(0.23);
    expect(uniform(edge, 'u_glow_press_fill')).toBe(1);
    expect(uniform(edge, 'u_show_glow')).toBe(1);
    expect(uniform(edge, 'u_corner_press')).toBe(0);
    expect(uniform(edge, 'u_corner_alpha')).toBe(0);
  });

  it('returns a released side to hover over 67 ms', () => {
    const edge = createEdge();
    hoverSide(edge);
    edge.setCursorPoints(point(0, 140), undefined, true);
    edge.update(1);

    edge.setCursorPoints(point(0, 140));
    expect(uniform(edge, 'u_glow_press_length')).toBe(1);
    edge.update(0.0335);
    expect(uniform(edge, 'u_glow_press_length')).toBeCloseTo(0.5);
    expect(uniform(edge, 'u_glow_press_fill')).toBeCloseTo(0.5);
    expect(edge.material.visible).toBe(true);
    edge.update(0.034);
    expect(uniform(edge, 'u_glow_press_length')).toBe(0);
    expect(uniform(edge, 'u_glow_press_fill')).toBe(0);
    expect(uniform(edge, 'u_show_glow')).toBe(1);
  });

  it('keeps a pressed side lit at the grab point', () => {
    const edge = createEdge();
    hoverSide(edge);
    edge.setCursorPoints(point(0, 140), undefined, true);
    edge.update(1 / 60);

    edge.setCursorPoints(point(-100, 130), undefined, true);
    edge.update(1 / 60);
    expect(uniform(edge, 'u_cursor_uv').toArray()).toEqual(sideUV);
    // Even off the band, the highlight stays where the card was grabbed.
    edge.setCursorPoints(point(0, 0), undefined, true);
    edge.update(1);
    expect(uniform(edge, 'u_cursor_uv').toArray()).toEqual(sideUV);
    expect(uniform(edge, 'u_show_glow')).toBe(1);

    // After release, the glow follows the pointer again.
    edge.setCursorPoints(point(-100, 130));
    expect(uniform(edge, 'u_cursor_uv').toArray()).toEqual([
      -100 / 500 + 0.5,
      130 / 300 + 0.5,
    ]);
  });

  it('thins a pressed corner arc over 40 ms and snaps back on release', () => {
    const edge = createEdge();
    edge.setCursorPoints(point(225, 125));
    edge.update(1);
    expect(uniform(edge, 'u_corner_press')).toBe(0);

    edge.setCursorPoints(point(225, 125), undefined, true);
    edge.update(0.02);
    expect(uniform(edge, 'u_corner_press')).toBeCloseTo(0.5);
    edge.update(0.02);
    expect(uniform(edge, 'u_corner_press')).toBeCloseTo(1);
    edge.update(0.001);
    expect(uniform(edge, 'u_corner_press')).toBe(1);
    expect(uniform(edge, 'u_corner_alpha')).toBe(1);
    expect(uniform(edge, 'u_glow_press_length')).toBe(0);
    expect(uniform(edge, 'u_glow_press_fill')).toBe(0);

    // The arc stays pressed for the whole resize drag.
    edge.setCursorPoints(point(0, 0), undefined, true);
    edge.update(1);
    expect(uniform(edge, 'u_corner_press')).toBe(1);

    edge.setCursorPoints(point(225, 125));
    expect(uniform(edge, 'u_corner_press')).toBe(0);
    expect(uniform(edge, 'u_corner_alpha')).toBe(1);
    edge.update(1 / 60);
    expect(uniform(edge, 'u_corner_press')).toBe(0);
  });

  it('presses a corner grabbed without hovering first', () => {
    const edge = createEdge();
    edge.setCursorPoints(point(225, 125), undefined, true);
    edge.update(1);
    expect(uniform(edge, 'u_corner_press')).toBe(1);
    expect(uniform(edge, 'u_glow_press_length')).toBe(0);
  });

  it('does not press when the hold starts off the band', () => {
    const edge = createEdge();
    edge.setCursorPoints(point(0, 0), undefined, true);
    edge.update(1);
    edge.setCursorPoints(point(0, 140), undefined, true);
    edge.update(1);
    expect(uniform(edge, 'u_glow_press_length')).toBe(0);
    expect(uniform(edge, 'u_glow_press_fill')).toBe(0);
    expect(uniform(edge, 'u_corner_press')).toBe(0);
  });

  it('presses each pointer slot on its own', () => {
    const edge = createEdge();
    edge.setCursorPoints(point(0, 140), point(-225, -125));
    edge.update(1);
    edge.setCursorPoints(point(0, 140), point(-225, -125), true);
    edge.update(1);
    expect(uniform(edge, 'u_glow_press_length')).toBe(1);
    expect(uniform(edge, 'u_glow_press_fill')).toBe(1);
    expect(uniform(edge, 'u_corner_press')).toBe(0);
    expect(uniform(edge, 'u_glow_press_length_2')).toBe(0);
    expect(uniform(edge, 'u_glow_press_fill_2')).toBe(0);
    expect(uniform(edge, 'u_corner_press_2')).toBe(1);
  });

  it('ends a handoff gap at once when pressed', () => {
    const edge = createEdge();
    hoverSide(edge);
    edge.setCursorPoints(point(225, -125));
    edge.update(0.05);
    expect(uniform(edge, 'u_corner_alpha')).toBe(0);
    edge.setCursorPoints(point(225, -125), undefined, true);
    expect(uniform(edge, 'u_corner_alpha')).toBe(1);
    edge.update(0.04);
    expect(uniform(edge, 'u_corner_press')).toBeCloseTo(1);

    edge.setCursorPoints(point(225, -125));
    edge.update(1);
    edge.setCursorPoints(point(0, 140));
    edge.update(0.04);
    edge.setCursorPoints(point(0, 140), undefined, true);
    edge.update(0.045);
    expect(uniform(edge, 'u_show_glow')).toBeCloseTo(0.5);
    expect(uniform(edge, 'u_glow_press_length')).toBeGreaterThan(0);
  });

  it('shows the arc right after the cut when pressed during it', () => {
    const edge = createEdge();
    hoverSide(edge);
    edge.setCursorPoints(point(225, -125));
    edge.update(0.015);
    edge.setCursorPoints(point(225, -125), undefined, true);
    expect(uniform(edge, 'u_corner_alpha')).toBe(0);
    edge.update(0.015);
    expect(uniform(edge, 'u_show_glow')).toBe(0);
    expect(uniform(edge, 'u_corner_alpha')).toBe(1);
  });

  it('uses the pressed Android XR colors', () => {
    const edge = createEdge();
    const color = (name: string) =>
      new THREE.Color().setRGB(
        uniform(edge, name).x,
        uniform(edge, name).y,
        uniform(edge, name).z
      );
    expect(color('u_glow_pressed_rim_color').getHexString()).toBe('eff9ff');
    expect(color('u_glow_pressed_fill_color').getHexString()).toBe('dbeeff');
  });
});
