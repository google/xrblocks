import * as THREE from 'three';
import {afterEach, describe, expect, it} from 'vitest';

import {disposeObjectTree} from '../../utils/ThreeDisposal';
import {createProceduralContent} from './ProceduralGeometry';
import {ProceduralMotionPlayer} from './ProceduralMotion';
import type {ScenePart, ScenePartMotion} from './SceneTypes';

const resources: THREE.Object3D[] = [];

function part(overrides: Partial<ScenePart> = {}): ScenePart {
  return {
    id: 'body',
    name: 'Body',
    shape: 'box',
    parent: null,
    position: [0, 0.5, 0],
    rotation: [0, 0, 0],
    size: [0.4, 0.5, 0.3],
    color: '#88bb99',
    ...overrides,
  };
}

function swing(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'swing',
    axis: 'z',
    pivot: [0, 0.2, 0],
    amplitude: Math.PI / 2,
    period: 4,
    ...overrides,
  } as ScenePartMotion;
}

function spin(overrides: Record<string, unknown> = {}) {
  return {
    kind: 'spin',
    axis: 'y',
    pivot: [-0.5, 0, 0],
    speed: Math.PI * 2,
    ...overrides,
  } as ScenePartMotion;
}

/** An arm hinged at its top end, with a hand riding along below it. */
function hinged(motion: ScenePartMotion = swing()): ScenePart[] {
  return [
    part(),
    part({
      id: 'arm',
      name: 'Arm',
      parent: 'body',
      position: [0, -0.2, 0],
      size: [0.1, 0.4, 0.1],
      motion,
    }),
    part({
      id: 'hand',
      name: 'Hand',
      shape: 'sphere',
      parent: 'arm',
      position: [0, -0.1, 0],
      size: [0.12, 0.12, 0.12],
    }),
  ];
}

function orbiting(motion: ScenePartMotion = spin()): ScenePart[] {
  return [
    part({
      id: 'block',
      name: 'Block',
      position: [0.5, 0.1, 0],
      size: [0.2, 0.2, 0.2],
      motion,
    }),
  ];
}

function build(parts: readonly ScenePart[]) {
  const content = createProceduralContent(parts, '#ffffff');
  resources.push(content);
  return content;
}

function play(parts: readonly ScenePart[], previous?: ProceduralMotionPlayer) {
  const content = build(parts);
  return {
    content,
    player: new ProceduralMotionPlayer(content, parts, previous),
  };
}

function group(content: THREE.Object3D, id: string) {
  let found: THREE.Object3D | undefined;
  content.traverse((child) => {
    if (child instanceof THREE.Group && child.name === id) found = child;
  });
  if (!found) throw new Error(`Missing part group "${id}".`);
  return found;
}

function worldOf(content: THREE.Object3D, id: string) {
  content.updateMatrixWorld(true);
  return group(content, id).getWorldPosition(new THREE.Vector3());
}

function expectVector(actual: THREE.Vector3, expected: readonly number[]) {
  const round = (value: number) => +value.toFixed(6) + 0;
  expect(actual.toArray().map(round)).toEqual(expected.map(round));
}

afterEach(() => {
  for (const object of resources.splice(0)) disposeObjectTree(object);
});

describe('ProceduralMotionPlayer', () => {
  it('rotates about every part-local axis around its pivot', () => {
    const cases = [
      {axis: 'x', pivot: [0, -0.5, 0], expected: [0.5, -0.4, 0.5]},
      {axis: 'y', pivot: [-0.5, 0, 0], expected: [0, 0.1, -0.5]},
      {axis: 'z', pivot: [-0.5, 0, 0], expected: [0, 0.6, 0]},
    ] as const;
    for (const {axis, pivot, expected} of cases) {
      const {content, player} = play(orbiting(spin({axis, pivot: [...pivot]})));
      player.update(0.25);
      expectVector(worldOf(content, 'block'), expected);
    }
  });

  it.each([
    swing({phase: 0.17}),
    spin({phase: 0.17, speed: Math.PI}),
    spin({phase: 0.17, speed: -Math.PI}),
  ])('seeks to the same pose as many deltas for $kind ($speed)', (motion) => {
    const parts = hinged(motion);
    parts[1].rotation = [0.3, -0.7, 0.4];
    const stepped = play(parts);
    const late = play(parts);
    const arm = group(late.content, 'arm');
    const pivot = new THREE.Vector3().fromArray(motion.pivot);
    late.content.updateMatrixWorld(true);
    const anchor = arm.localToWorld(pivot.clone());
    for (let step = 0; step < 125; step++) stepped.player.update(0.125);
    late.player.seek(15.625);
    expect(
      arm.quaternion.angleTo(group(stepped.content, 'arm').quaternion)
    ).toBeLessThan(1e-7);
    expectVector(
      worldOf(late.content, 'hand'),
      worldOf(stepped.content, 'hand').toArray()
    );
    expect(arm.localToWorld(pivot.clone()).distanceTo(anchor)).toBeLessThan(
      1e-9
    );
    const held = arm.quaternion.clone();
    late.player.seek(15.625);
    expect(arm.quaternion.equals(held)).toBe(true);
    late.player.seek(0);
    expect(
      arm.quaternion.angleTo(group(play(parts).content, 'arm').quaternion)
    ).toBeLessThan(1e-7);
    late.player.seek(15.625);
    late.player.update(0.125);
    stepped.player.update(0.125);
    expectVector(
      worldOf(late.content, 'hand'),
      worldOf(stepped.content, 'hand').toArray()
    );
  });

  it('carries the live cycle across geometry, pivot, and timing edits', () => {
    const before = play(hinged());
    before.player.update(1);
    const carried = hinged(
      swing({period: 8, amplitude: 1, pivot: [0, 0.4, 0]})
    );
    carried[1].size = [0.2, 0.8, 0.2];
    carried[2].parent = 'body';
    const after = play(carried, before.player);
    // The cycle stays a quarter in, now at the retuned amplitude.
    expect(group(after.content, 'arm').quaternion.z).toBeCloseTo(
      Math.sin(0.5),
      9
    );
  });
});
