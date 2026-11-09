import * as THREE from 'three';
import {describe, expect, it} from 'vitest';

import {UICardEdge, isCornerHit, isOuterEdgeHit} from './UICardEdge';

// A 400x200 card with a 50px band gives a 500x300 edge layer.
const SIZE = [500, 300] as const;
const MARGIN = 50;

function uv(x: number, y: number): THREE.Vector2 {
  return new THREE.Vector2(x / SIZE[0] + 0.5, y / SIZE[1] + 0.5);
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
  it('covers the rounded corner arc plus one margin along each side', () => {
    expect(isCornerHit(uv(240, 140), SIZE, MARGIN, 24)).toBe(true);
    expect(isCornerHit(uv(-240, -140), SIZE, MARGIN, 24)).toBe(true);
    // 124px corner extent from the outer edge.
    expect(isCornerHit(uv(250 - 120, 140), SIZE, MARGIN, 24)).toBe(true);
    expect(isCornerHit(uv(250 - 130, 140), SIZE, MARGIN, 24)).toBe(false);
  });

  it('leaves the middle of every side for translation', () => {
    expect(isCornerHit(uv(0, 140), SIZE, MARGIN, 24)).toBe(false);
    expect(isCornerHit(uv(240, 0), SIZE, MARGIN, 24)).toBe(false);
    // A large radius is capped at half of each side.
    expect(isCornerHit(uv(240, 70), SIZE, MARGIN, 500)).toBe(false);
    expect(isCornerHit(uv(240, 80), SIZE, MARGIN, 500)).toBe(true);
  });
});

describe('isOuterEdgeHit', () => {
  it('accepts the outer band and rejects the hollow interior', () => {
    expect(isOuterEdgeHit(uv(0, 120), SIZE, MARGIN, 24)).toBe(true);
    expect(isOuterEdgeHit(uv(0, 0), SIZE, MARGIN, 24)).toBe(false);
    expect(isOuterEdgeHit(uv(0, 95), SIZE, MARGIN, 24)).toBe(false);
    expect(isOuterEdgeHit(uv(0, 95), SIZE, MARGIN, 24, 10)).toBe(true);
  });
});

describe('UICardEdge resize corner arc', () => {
  it('fades the arc in over 0.2 s on a resize corner without the glow', () => {
    const edge = createEdge();
    edge.setCursorPoints(point(-225, 125));

    expect(uniform(edge, 'u_show_glow')).toBe(0);
    expect(uniform(edge, 'u_corner_sign').toArray()).toEqual([-1, 1]);
    expect(uniform(edge, 'u_corner_alpha')).toBe(0);
    expect(edge.visible).toBe(true);

    edge.update(0.1);
    expect(uniform(edge, 'u_corner_alpha')).toBeCloseTo(0.5);
    edge.update(0.15);
    expect(uniform(edge, 'u_corner_alpha')).toBe(1);
    // Holding on the corner keeps the arc steady rather than flickering.
    edge.update(1 / 60);
    expect(uniform(edge, 'u_corner_alpha')).toBe(1);
    edge.update(1 / 60);
    expect(uniform(edge, 'u_corner_alpha')).toBe(1);
  });

  it('fades the arc out in place after the pointer leaves the corner', () => {
    const edge = createEdge();
    edge.setCursorPoints(point(225, -125));
    edge.update(1);

    // Moving to the middle of a side shows the moving glow instead.
    edge.setCursorPoints(point(0, 140));
    expect(uniform(edge, 'u_show_glow')).toBe(1);
    edge.update(0.1);
    expect(uniform(edge, 'u_corner_alpha')).toBeCloseTo(0.5);
    expect(uniform(edge, 'u_corner_sign').toArray()).toEqual([1, -1]);

    edge.setCursorPoints();
    edge.update(0.1);
    expect(uniform(edge, 'u_corner_alpha')).toBe(0);
    expect(edge.visible).toBe(false);
  });

  it('keeps the grabbed corner lit while held, even off the band', () => {
    const edge = createEdge();
    edge.setCursorPoints(point(225, 125));
    edge.update(1);
    // Pressing keeps the corner, wherever the pointer goes while held.
    edge.setCursorPoints(point(225, 125), undefined, true);
    edge.update(1);

    edge.setCursorPoints(point(0, 0), undefined, true);
    edge.update(1);
    expect(uniform(edge, 'u_corner_alpha')).toBe(1);
    expect(uniform(edge, 'u_corner_sign').toArray()).toEqual([1, 1]);
    expect(uniform(edge, 'u_show_glow')).toBe(0);

    edge.setCursorPoints(point(0, 0));
    edge.update(1);
    expect(uniform(edge, 'u_corner_alpha')).toBe(0);
  });

  it('does not light a corner arc while dragging from a side', () => {
    const edge = createEdge();
    edge.setCursorPoints(point(0, 140));
    edge.setCursorPoints(point(225, 125), undefined, true);
    edge.update(1);
    expect(uniform(edge, 'u_corner_alpha')).toBe(0);
    expect(uniform(edge, 'u_show_glow')).toBe(1);
  });

  it('tracks a second pointer in its own slot', () => {
    const edge = createEdge();
    edge.setCursorPoints(point(0, 140), point(-225, -125));
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
});
