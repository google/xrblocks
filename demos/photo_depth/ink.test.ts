import * as THREE from 'three';
import {describe, expect, it} from 'vitest';

import {
  Ink,
  OneEuroFilter3,
  StrokeBuilder,
  ribbonGeometry,
  simplifyPolyline,
} from './Ink.js';
import {makeNoise} from './testScenes';

const UP = new THREE.Vector3(0, 0, 1); // a wall facing +z
const v = (x: number, y: number, z = 0) => new THREE.Vector3(x, y, z);

describe('simplifyPolyline', () => {
  it('drops points on straight runs and keeps corners', () => {
    const line = [v(0, 0), v(0.1, 0.0005), v(0.2, 0), v(0.2, 0.1), v(0.2, 0.2)];
    expect(simplifyPolyline(line, 0.002)).toEqual([0, 2, 4]);
    expect(simplifyPolyline(line, 0.0001)).toEqual([0, 1, 2, 4]); // 3 is exactly on 2-4
    expect(simplifyPolyline([v(0, 0)], 0.01)).toEqual([0]);
  });
});

describe('OneEuroFilter3', () => {
  it('removes jitter from a slow hand and keeps up with a fast one', () => {
    const noise = makeNoise(7);
    const filter = new OneEuroFilter3();
    let rawSq = 0;
    let filteredSq = 0;
    for (let i = 0; i < 300; i++) {
      const t = i / 72;
      const truth = v(0.02 * t, 1, 0); // 2 cm/s
      const jitter = v(noise() * 0.01, noise() * 0.01, 0);
      const out = filter.filter(truth.clone().add(jitter), t);
      if (i > 30) {
        rawSq += jitter.lengthSq();
        filteredSq += out.distanceToSquared(truth);
      }
    }
    expect(filteredSq).toBeLessThan(0.25 * rawSq);
    // A fast sweep (1 m/s) lags by only a few centimeters.
    const fast = new OneEuroFilter3();
    let out = v(0, 0);
    for (let i = 0; i < 72; i++) out = fast.filter(v(i / 72, 0), i / 72);
    expect(out.x).toBeGreaterThan(71 / 72 - 0.05);
  });
});

describe('StrokeBuilder', () => {
  const noFilter = {minCutoff: 1e6}; // pass-through, for exact geometry

  it('keeps straight strokes to a couple of points', () => {
    const builder = new StrokeBuilder({filter: noFilter});
    for (let i = 0; i <= 100; i++) builder.add(v(i / 200, 0), UP, i / 72);
    const [segment] = builder.finish();
    expect(segment.points).toHaveLength(2);
    expect(segment.points[1].x).toBeCloseTo(0.5, 6);
  });

  it('skips points closer than the spacing and keeps curves', () => {
    const builder = new StrokeBuilder({filter: noFilter});
    for (let i = 0; i < 10; i++) builder.add(v(i * 0.001, 0), UP, i / 72);
    expect(builder.segments[0].points).toHaveLength(2);
    const circle = new StrokeBuilder({filter: noFilter});
    for (let i = 0; i <= 200; i++) {
      const a = (i / 200) * Math.PI * 2;
      circle.add(v(0.1 * Math.cos(a), 0.1 * Math.sin(a)), UP, i / 72);
    }
    const [ring] = circle.finish();
    // Far fewer than 200 points, yet within 2 mm of the circle.
    expect(ring.points.length).toBeLessThan(40);
    expect(ring.points.length).toBeGreaterThan(8);
    for (const p of ring.points) expect(p.length()).toBeCloseTo(0.1, 2);
  });

  it('breaks at misses and at jumps (a table edge in front of a wall)', () => {
    const builder = new StrokeBuilder({filter: noFilter});
    builder.add(v(0, 0), UP, 0);
    builder.add(v(0.05, 0), UP, 0.1);
    builder.gap();
    builder.add(v(0.1, 0), UP, 0.2);
    builder.add(v(0.1, 0, -0.5), UP, 0.3); // 50 cm deeper: the wall
    builder.add(v(0.15, 0, -0.5), UP, 0.4);
    expect(builder.finish().map((s) => s.points.length)).toEqual([2, 1, 2]);
  });
});

describe('ribbonGeometry', () => {
  it('lies on the surface, lifted along the normal, at the given width', () => {
    const geometry = ribbonGeometry([v(0, 0), v(0.2, 0)], [UP, UP], {
      width: 0.01,
      lift: 0.005,
    });
    const position = geometry.getAttribute('position');
    expect(position.count).toBe(4);
    expect(geometry.getIndex()!.count).toBe(6);
    for (let i = 0; i < 4; i++) {
      expect(position.getZ(i)).toBeCloseTo(0.005, 6);
      expect(Math.abs(position.getY(i))).toBeCloseTo(0.005, 6);
    }
  });

  it('draws a dot for a single point', () => {
    const geometry = ribbonGeometry([v(1, 1, 1)], [UP], {
      width: 0.02,
      lift: 0,
    });
    const position = geometry.getAttribute('position');
    expect(position.count).toBe(13);
    const center = v(1, 1, 1);
    for (let i = 1; i < 13; i++) {
      const p = new THREE.Vector3().fromBufferAttribute(position, i);
      expect(p.distanceTo(center)).toBeCloseTo(0.01, 6);
      expect(p.z).toBeCloseTo(1, 6);
    }
  });
});

describe('Ink', () => {
  it('draws one ribbon per polyline and clears', () => {
    const ink = new Ink({filter: {minCutoff: 1e6}});
    const hand = {};
    ink.begin(hand);
    ink.addHit(hand, {point: v(0, 0), normal: UP}, 0);
    ink.addHit(hand, {point: v(0.1, 0), normal: UP}, 0.1);
    ink.addHit(hand, null, 0.2);
    ink.addHit(hand, {point: v(0.3, 0), normal: UP}, 0.3);
    ink.end(hand);
    expect(ink.count).toBe(2);
    // A tap: one dot.
    ink.begin(hand);
    ink.addHit(hand, {point: v(1, 0), normal: UP}, 1);
    ink.end(hand);
    expect(ink.count).toBe(3);
    expect(ink.active.size).toBe(0);
    ink.clear();
    expect(ink.count).toBe(0);
    ink.dispose();
  });
});
