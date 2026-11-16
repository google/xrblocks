import {SplatMath, Splats} from '@sparkjsdev/radix/core';
import * as THREE from 'three';
import {describe, expect, it, vi} from 'vitest';

import {
  attachSplatManager,
  computeRadixSplatBounds,
  getSplatCollectionEntry,
  markSplatEntryLive,
  RadixSplatObject,
} from './RadixSplatObject';

type RadixModule = typeof import('@sparkjsdev/radix');

function createMockRadix() {
  const disposeGenerator = vi.fn();
  const forArrays = vi.fn(() => ({generateSplat: vi.fn()}));
  const uniform = vi.fn((initial: number) => ({value: initial}));
  return {
    Splats,
    SplatMath,
    TSL: {uniform},
    SplatGenerator: {forArrays},
    SplatProjector: {dispose: disposeGenerator},
    SplatCollection: {
      arrays: vi.fn((arrays, opts = {}) => ({
        count: arrays.count,
        ...opts,
        generator: {kind: 'shared'},
        data: {splats: arrays, shPalette: opts.shPalette},
      })),
      object: vi.fn((obj) => obj),
    },
    mocks: {disposeGenerator, forArrays, uniform},
  };
}

describe('computeRadixSplatBounds', () => {
  it('computes 1-sigma rotated ellipsoid bounds and ignores zero-opacity splats', () => {
    const data = Splats.make(3);
    const bundle = Splats.get(data).bundle;

    Splats.store(bundle, 0, {
      center: {x: 1, y: 2, z: -3},
      scales: {x: 0.5, y: 1.0, z: 0.25},
      quaternion: {x: 0, y: 0, z: 0, w: 1},
      rgb: {r: 1, g: 1, b: 1},
      opacity: 1,
    });
    Splats.store(bundle, 1, {
      center: {x: -2, y: 0, z: 1},
      scales: {x: 0.2, y: 0.2, z: 0.2},
      quaternion: {x: 0, y: 0, z: 0, w: 1},
      rgb: {r: 1, g: 0, b: 0},
      opacity: 0.8,
    });
    // Zero-opacity splat far away should be excluded from non-centersOnly bounds.
    Splats.store(bundle, 2, {
      center: {x: 100, y: 100, z: 100},
      scales: {x: 5, y: 5, z: 5},
      quaternion: {x: 0, y: 0, z: 0, w: 1},
      rgb: {r: 0, g: 0, b: 0},
      opacity: 0,
    });

    const box = computeRadixSplatBounds(data, {Splats, SplatMath});
    expect(box.min.x).toBeCloseTo(-2.2, 2);
    expect(box.min.y).toBeCloseTo(-0.2, 2);
    expect(box.min.z).toBeCloseTo(-3.25, 2);
    expect(box.max.x).toBeCloseTo(1.5, 2);
    expect(box.max.y).toBeCloseTo(3.0, 2);
    expect(box.max.z).toBeCloseTo(1.2, 2);
  });

  it('returns an empty Box3 when count is 0', () => {
    const data = Splats.make(0);
    const box = computeRadixSplatBounds(data, {Splats, SplatMath});
    expect(box.isEmpty()).toBe(true);
  });
});

describe('RadixSplatObject', () => {
  it('uses shared generator by default and lazily upgrades to a uniform opacity modifier on fade', () => {
    const radix = createMockRadix();
    const gpuSplats = {count: 42, dispose: vi.fn()};
    const gpuShPalette = {count: 8, dispose: vi.fn()};
    const bounds = new THREE.Box3(
      new THREE.Vector3(-1, 0, -1),
      new THREE.Vector3(1, 2, 1)
    );

    const obj = new RadixSplatObject({
      gpuSplats: gpuSplats as never,
      gpuShPalette: gpuShPalette as never,
      boundingBox: bounds,
      radix: radix as unknown as RadixModule,
    });

    const initialEntry = getSplatCollectionEntry(obj);
    expect(radix.SplatCollection.arrays).toHaveBeenCalledTimes(1);
    expect(radix.mocks.forArrays).not.toHaveBeenCalled();

    // Fading below 1 builds the opacity uniform modifier once; further updates reuse it.
    obj.opacity = 0.5;
    expect(radix.mocks.uniform).toHaveBeenCalledWith(0.5);
    expect(radix.mocks.forArrays).toHaveBeenCalledTimes(1);
    const fadedEntry = getSplatCollectionEntry(obj);
    expect(fadedEntry).not.toBe(initialEntry);

    obj.opacity = 0.25;
    expect(radix.mocks.forArrays).toHaveBeenCalledTimes(1);
    expect(getSplatCollectionEntry(obj)).toBe(fadedEntry);
  });

  it('notifies smooth uniform fades without rebuilding SplatCollection until opacity reaches 0', () => {
    const radix = createMockRadix();
    const gpuSplats = {count: 10, dispose: vi.fn()};
    const notifyChanged = vi.fn();
    const obj = new RadixSplatObject({
      gpuSplats: gpuSplats as never,
      boundingBox: new THREE.Box3(),
      radix: radix as unknown as RadixModule,
      options: {dynamicOpacity: true},
    });
    attachSplatManager(obj, {unregister: vi.fn(), notifyChanged});

    obj.opacity = 0.6;
    expect(notifyChanged).toHaveBeenLastCalledWith({
      collectionChanged: false,
      needsSort: true,
    });

    obj.opacity = 0;
    expect(notifyChanged).toHaveBeenLastCalledWith({
      collectionChanged: true,
      needsSort: true,
    });

    obj.opacity = 0.4;
    expect(notifyChanged).toHaveBeenLastCalledWith({
      collectionChanged: true,
      needsSort: true,
    });
  });

  it('disposes GPU arrays immediately when never watched by a SplatRenderer', () => {
    const radix = createMockRadix();
    const gpuSplats = {count: 10, dispose: vi.fn()};
    const obj = new RadixSplatObject({
      gpuSplats: gpuSplats as never,
      boundingBox: new THREE.Box3(),
      radix: radix as unknown as RadixModule,
    });

    // Even if an entry was built, if it was never live in a SplatRenderer, dispose immediately.
    getSplatCollectionEntry(obj);
    obj.dispose();
    expect(obj.isDisposed).toBe(true);
    expect(gpuSplats.dispose).toHaveBeenCalledTimes(1);
  });

  it('defers GPU disposal across hide -> release() -> show -> dispose() cycles', () => {
    const radix = createMockRadix();
    const gpuSplats = {count: 10, dispose: vi.fn()};
    const gpuShPalette = {count: 4, dispose: vi.fn()};
    const obj = new RadixSplatObject({
      gpuSplats: gpuSplats as never,
      gpuShPalette: gpuShPalette as never,
      boundingBox: new THREE.Box3(),
      radix: radix as unknown as RadixModule,
      options: {dynamicOpacity: true},
    });

    const entry = getSplatCollectionEntry(obj);
    markSplatEntryLive(obj, entry);

    // Hide cycle: SplatRenderer sweeps entry out, but object is not disposed.
    entry.release?.();
    expect(gpuSplats.dispose).not.toHaveBeenCalled();

    // Re-show cycle: entry becomes live again, then object is disposed while in-flight.
    markSplatEntryLive(obj, entry);
    obj.dispose();
    expect(gpuSplats.dispose).not.toHaveBeenCalled();

    // Simulate Radix SplatRenderer.sweep() releasing the retired SplatObject.
    entry.release?.();
    expect(gpuSplats.dispose).toHaveBeenCalledTimes(1);
    expect(gpuShPalette.dispose).toHaveBeenCalledTimes(1);
    expect(radix.mocks.disposeGenerator).toHaveBeenCalledTimes(1);
  });
});
