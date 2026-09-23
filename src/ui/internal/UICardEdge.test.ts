import * as THREE from 'three';
import {describe, expect, it} from 'vitest';

import {isCornerHit} from './UICardEdge';

// A 400x200 card with a 50px band gives a 500x300 edge layer.
const SIZE = [500, 300] as const;
const MARGIN = 50;

function uv(x: number, y: number): THREE.Vector2 {
  return new THREE.Vector2(x / SIZE[0] + 0.5, y / SIZE[1] + 0.5);
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
