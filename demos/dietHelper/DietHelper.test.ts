import * as THREE from 'three';
import {describe, expect, it, vi} from 'vitest';

import {DietHelper} from './DietHelper.js';

vi.mock('xrblocks', async () => {
  const {Script} = await import('../../src/core/Script');
  return {Script};
});

const burger = {
  id: 'burger',
  name: 'Classic Burger',
  nutrition: {calories: 540, protein: 28, carbs: 42, fat: 28},
};

function dishViewer() {
  const viewer = new THREE.Object3D();
  viewer.userData.dish = burger;
  const mesh = new THREE.Object3D();
  viewer.add(mesh);
  return {viewer, mesh};
}

describe('DietHelper', () => {
  it('logs the dish whose viewer owns a completed selection', () => {
    const helper = new DietHelper();
    const {viewer, mesh} = dishViewer();

    helper.onSelectEnd({completed: true, reason: 'released', target: viewer});
    helper.onSelectEnd({completed: true, reason: 'released', target: mesh});

    expect(helper.mealLog.map((entry) => entry.dish)).toEqual([
      'burger',
      'burger',
    ]);
    expect(helper.mealLog[0]).toMatchObject({
      name: 'Classic Burger',
      calories: 540,
      protein: 28,
    });
  });

  it('ignores cancelled selections and other targets', () => {
    const helper = new DietHelper();
    const {viewer} = dishViewer();

    helper.onSelectEnd({
      completed: false,
      reason: 'released-outside',
      target: viewer,
    });
    helper.onSelectEnd({
      completed: true,
      reason: 'released',
      target: new THREE.Object3D(),
    });
    helper.onSelectEnd({completed: true, reason: 'released'});

    expect(helper.mealLog).toEqual([]);
  });
});
