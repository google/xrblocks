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
  it('counts animated parts and poses them at construction', () => {
    const {content, player} = play(hinged(swing({phase: 0.25})));
    expect(player.count).toBe(1);
    // A quarter cycle into a swing is its full positive amplitude.
    expectVector(group(content, 'arm').position, [0.2, 0, 0]);
    expectVector(worldOf(content, 'hand'), [0.3, 0.5, 0]);
    expect(play([part()]).player.count).toBe(0);
  });

  it('leaves the authored rest pose when a cycle starts at zero', () => {
    const {content, player} = play(hinged());
    const arm = group(content, 'arm');
    expectVector(arm.position, [0, -0.2, 0]);
    expect(arm.quaternion.angleTo(new THREE.Quaternion())).toBeCloseTo(0, 9);
    player.update(0);
    expectVector(arm.position, [0, -0.2, 0]);
    expect(arm.quaternion.angleTo(new THREE.Quaternion())).toBeCloseTo(0, 9);
  });

  it('binds part groups rather than a mesh with the same display name', () => {
    const parts = hinged();
    parts[0].name = 'arm';
    const {content, player} = play(parts);
    const bodyMesh = group(content, 'body').children[0];
    const rest = bodyMesh.quaternion.clone();
    player.update(1);
    expect(bodyMesh.quaternion.equals(rest)).toBe(true);
    expect(group(content, 'arm').quaternion.z).toBeCloseTo(
      Math.sin(Math.PI / 4),
      9
    );
  });

  it('keeps even very large finite time steps finite and cyclic', () => {
    for (const motion of [
      swing({period: 0.25}),
      spin({speed: Math.PI * 4}),
      spin({speed: -Math.PI * 4}),
      spin({speed: Number.MIN_VALUE}),
    ]) {
      const {content, player} = play(orbiting(motion));
      player.update(Number.MAX_VALUE);
      content.updateMatrixWorld(true);
      expect(
        group(content, 'block').matrixWorld.elements.every(Number.isFinite)
      ).toBe(true);
    }
  });

  it('spins in both directions about its axle', () => {
    const forward = play(orbiting());
    forward.player.update(0.25);
    expectVector(worldOf(forward.content, 'block'), [0, 0.1, -0.5]);
    const backward = play(orbiting(spin({speed: -Math.PI * 2})));
    backward.player.update(0.25);
    expectVector(worldOf(backward.content, 'block'), [0, 0.1, 0.5]);
    backward.player.update(0.5);
    expectVector(worldOf(backward.content, 'block'), [0, 0.1, -0.5]);
  });

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

  it('holds the pivot still through a rotated rest pose and nested parts', () => {
    const parts = hinged(swing({axis: 'x', phase: 0.1}));
    parts[1].rotation = [0.3, -0.7, 0.4];
    const {content, player} = play(parts);
    const arm = group(content, 'arm');
    const pivotAt = () => {
      content.updateMatrixWorld(true);
      return arm.localToWorld(new THREE.Vector3(0, 0.2, 0));
    };
    const anchor = pivotAt();
    const handStart = worldOf(content, 'hand').clone();
    for (let step = 0; step < 12; step++) {
      player.update(0.37);
      expect(pivotAt().distanceTo(anchor)).toBeLessThan(1e-9);
    }
    // Descendants inherit the motion instead of holding their rest pose.
    expect(worldOf(content, 'hand').distanceTo(handStart)).toBeGreaterThan(
      0.05
    );
  });

  it('keeps transforms free of accumulated drift', () => {
    const stepped = play(orbiting(spin({speed: Math.PI})));
    const once = play(orbiting(spin({speed: Math.PI})));
    for (let step = 0; step < 3; step++) stepped.player.update(0.1);
    once.player.update(0.3);
    expectVector(
      worldOf(stepped.content, 'block'),
      worldOf(once.content, 'block').toArray()
    );
    const before = worldOf(stepped.content, 'block').clone();
    // A full revolution returns to the same pose instead of drifting.
    stepped.player.update(2);
    expect(worldOf(stepped.content, 'block').distanceTo(before)).toBeLessThan(
      1e-9
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

  it('treats an absent starting phase as zero when carrying a cycle', () => {
    const before = play(hinged());
    before.player.update(1);
    const after = play(hinged(swing({phase: 0})), before.player);
    expect(group(after.content, 'arm').quaternion.z).toBeCloseTo(
      Math.sin(Math.PI / 4),
      9
    );
  });

  it('restarts when the declared phase or the motion kind changes', () => {
    const before = play(hinged());
    before.player.update(1);
    const rephased = play(hinged(swing({phase: 0.5})), before.player);
    expect(group(rephased.content, 'arm').quaternion.z).toBeCloseTo(0, 9);
    const rekinded = play(
      hinged(spin({axis: 'z', pivot: [0, 0.2, 0], speed: 1})),
      before.player
    );
    expect(group(rekinded.content, 'arm').quaternion.z).toBeCloseTo(0, 9);
  });

  it('detaches its inputs and never drives a previous player', () => {
    const previous = play(orbiting());
    previous.player.update(0.25);
    const held = worldOf(previous.content, 'block').clone();
    const parts = orbiting();
    const content = build(parts);
    const player = new ProceduralMotionPlayer(content, parts, previous.player);
    parts[0].position[0] = 9;
    parts[0].rotation[1] = 2;
    const motion = parts[0].motion;
    if (motion) {
      motion.pivot[0] = 9;
      motion.phase = 0.5;
    }
    player.update(0.25);
    // The carried cycle resumes at a quarter turn and advances another.
    expectVector(worldOf(content, 'block'), [-0.5, 0.1, 0]);
    expectVector(worldOf(previous.content, 'block'), held.toArray());
  });

  it('rejects invalid time steps and missing part groups', () => {
    const {player} = play(orbiting());
    for (const delta of [-0.1, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(() => player.update(delta)).toThrow('time step');
    }
    expect(() => player.update('1' as unknown as number)).toThrow('time step');
    expect(
      () => new ProceduralMotionPlayer(build([part()]), orbiting())
    ).toThrow('block');
  });

  it('rejects malformed motion definitions instead of posing NaN', () => {
    const content = build(hinged());
    const posed = () => {
      content.updateMatrixWorld(true);
      return group(content, 'arm').matrixWorld.elements.every(Number.isFinite);
    };
    const cases: Array<[Record<string, unknown>, string]> = [
      [{amplitude: 0}, 'amplitude'],
      [{amplitude: Math.PI * 1.5}, 'amplitude'],
      [{amplitude: Number.NaN}, 'amplitude'],
      [{period: 0.1}, 'period'],
      [{period: 120}, 'period'],
      [{phase: 1.5}, 'phase'],
      [{phase: Number.NaN}, 'phase'],
      [{pivot: [6, 0, 0]}, 'pivot'],
      [{pivot: [0, Number.NaN, 0]}, 'pivot'],
      [{axis: 'w'}, 'axis'],
      [{kind: 'wobble'}, 'motion'],
    ];
    for (const [changes, message] of cases) {
      expect(
        () => new ProceduralMotionPlayer(content, hinged(swing(changes)))
      ).toThrow(message);
      expect(posed()).toBe(true);
    }
    for (const changes of [{speed: 0}, {speed: 20}, {speed: Number.NaN}]) {
      expect(
        () => new ProceduralMotionPlayer(content, hinged(spin(changes)))
      ).toThrow('speed');
    }
  });
});
