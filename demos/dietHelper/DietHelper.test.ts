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

/** Presses `target`, runs `during` while held, then releases. */
function press(
  helper: DietHelper,
  target: THREE.Object3D | undefined,
  {during = () => {}, completed = true} = {}
) {
  const source = {controller: new THREE.Object3D()};
  helper.onSelectStart({source, target});
  during();
  helper.onSelectEnd({
    source,
    target,
    completed,
    reason: completed ? 'released' : 'released-outside',
  });
}

describe('DietHelper', () => {
  it('logs a tap on a dish or anything inside its viewer', () => {
    const helper = new DietHelper();
    const {viewer, mesh} = dishViewer();

    press(helper, viewer);
    press(helper, mesh);

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

  it('still logs a tap with a little hand jitter', () => {
    const helper = new DietHelper();
    const {viewer} = dishViewer();

    press(helper, viewer, {
      during: () => {
        viewer.position.x += 0.003;
        viewer.rotateY(0.03);
      },
    });

    expect(helper.mealLog).toHaveLength(1);
  });

  it('does not log a press that moves, turns or scales the dish', () => {
    const helper = new DietHelper();
    const {viewer} = dishViewer();

    press(helper, viewer, {during: () => (viewer.position.x += 0.2)});
    press(helper, viewer, {during: () => viewer.rotateY(0.5)});
    press(helper, viewer, {during: () => viewer.scale.setScalar(1.3)});

    expect(helper.mealLog).toEqual([]);
  });

  it('ignores cancelled presses and other targets', () => {
    const helper = new DietHelper();
    const {viewer} = dishViewer();

    press(helper, viewer, {completed: false});
    press(helper, new THREE.Object3D());
    press(helper, undefined);

    expect(helper.mealLog).toEqual([]);
  });
});
