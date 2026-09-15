import * as THREE from 'three';
import {FontLoader} from 'three/addons/loaders/FontLoader.js';
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest';

import {MeasureScene} from './MeasureScene.js';

vi.mock('xrblocks', async () => {
  const {Script} = await import('../../src/core/Script');
  return {Script};
});

describe('MeasureScene', () => {
  beforeEach(() => {
    vi.spyOn(FontLoader.prototype, 'load').mockImplementation(() => {});
  });

  afterEach(() => vi.restoreAllMocks());

  function event(controller: THREE.Object3D, point?: THREE.Vector3) {
    return {
      source: {controller},
      target: new THREE.Object3D(),
      intersection: point ? {point} : undefined,
    };
  }

  it('initializes without the removed global reticle helper', () => {
    const scene = new MeasureScene();
    expect(() => scene.init()).not.toThrow();
    expect(scene.children).toHaveLength(3);
  });

  it('uses resolved events and keeps simultaneous measurements separate', () => {
    const scene = new MeasureScene();
    const left = new THREE.Object3D();
    const right = new THREE.Object3D();
    const start = new THREE.Vector3(0, 0, -1);
    const end = new THREE.Vector3(1, 0, -1);

    scene.onSelectStart(event(left, start));
    scene.onSelectStart(event(right, start));
    const leftTape = scene.activeMeasuringTapes.get(left);
    const rightTape = scene.activeMeasuringTapes.get(right);
    expect(scene.activeMeasuringTapes.size).toBe(2);
    expect(leftTape.xb.pointerEvents).toBe('none');
    expect(leftTape.firstPoint).not.toBe(start);

    scene.onSelecting(event(left, end));
    expect(leftTape.secondPoint).toEqual(end);
    expect(leftTape.getLengthText()).toBe('1.00 m');
    expect(rightTape.secondPoint).toEqual(start);

    scene.onSelecting(event(left));
    expect(leftTape.secondPoint).toEqual(end);
    scene.onSelectEnd(event(left));
    scene.onSelecting(event(left, start));
    expect(leftTape.secondPoint).toEqual(end);
    expect(scene.children).toContain(leftTape);
    expect(scene.activeMeasuringTapes.has(right)).toBe(true);
  });

  it('ignores selections without a hit and releases a lost source', () => {
    const scene = new MeasureScene();
    const controller = new THREE.Object3D();
    scene.onSelectStart(event(controller));
    expect(scene.activeMeasuringTapes.size).toBe(0);
    scene.onSelecting(event(controller, new THREE.Vector3()));
    scene.onSelectStart(event(controller, new THREE.Vector3()));
    scene.onSelectEnd({
      ...event(controller),
      completed: false,
      reason: 'source-lost',
    });
    expect(scene.activeMeasuringTapes.size).toBe(0);
  });
});
