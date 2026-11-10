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
});

describe('outerBandDistance', () => {
  it('measures how far outside the card a band hit is', () => {
    // The card's own half-size is 250 - 50 = 200 by 150 - 50 = 100 px.
    expect(outerBandDistance(uv(245, 0), SIZE, MARGIN)).toBeCloseTo(45);
    expect(outerBandDistance(uv(-210, 20), SIZE, MARGIN)).toBeCloseTo(10);
    expect(outerBandDistance(uv(0, 140), SIZE, MARGIN)).toBeCloseTo(40);
    expect(outerBandDistance(uv(230, 130), SIZE, MARGIN)).toBeCloseTo(30);
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

  it('shows the arc only after the side glow has faded out', () => {
    const edge = createEdge();
    edge.setCursorPoints(point(0, 140));
    edge.update(1);

    edge.setCursorPoints(point(225, -125));
    expect(uniform(edge, 'u_corner_alpha')).toBe(0);
    expect(uniform(edge, 'u_show_glow')).toBe(1);
    edge.update(0.045);
    expect(uniform(edge, 'u_show_glow')).toBeCloseTo(0.5);
    expect(uniform(edge, 'u_corner_alpha')).toBe(0);
    // The glow fades where it was rather than following onto the corner.
    expect(uniform(edge, 'u_cursor_uv').toArray()).toEqual([
      0.5,
      140 / 300 + 0.5,
    ]);

    edge.update(0.05);
    expect(uniform(edge, 'u_show_glow')).toBe(0);
    expect(uniform(edge, 'u_corner_alpha')).toBe(1);
    expect(uniform(edge, 'u_corner_sign').toArray()).toEqual([1, -1]);
  });

  it('hides the arc at once and fades the glow in when moving to a side', () => {
    const edge = createEdge();
    edge.setCursorPoints(point(225, -125));
    edge.update(1);

    edge.setCursorPoints(point(0, 140));
    expect(uniform(edge, 'u_corner_alpha')).toBe(0);
    expect(uniform(edge, 'u_show_glow')).toBe(0);
    expect(uniform(edge, 'u_cursor_uv').toArray()).toEqual([
      0.5,
      140 / 300 + 0.5,
    ]);
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
    edge.setCursorPoints(point(225, 125), undefined, true);
    edge.update(1);
    expect(uniform(edge, 'u_corner_alpha')).toBe(0);
    expect(uniform(edge, 'u_show_glow')).toBe(1);
    expect(uniform(edge, 'u_cursor_uv').toArray()).toEqual([
      225 / 500 + 0.5,
      125 / 300 + 0.5,
    ]);
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
