import * as THREE from 'three';
import {describe, expect, it, vi} from 'vitest';

// @ts-expect-error The executable browser demo is a JavaScript consumer.
import {findClearSpawn, getWorldSpawn} from '../../../demos/roomcraft/Spawn.js';

function box(min: number[], max: number[]) {
  return new THREE.Box3(
    new THREE.Vector3().fromArray(min),
    new THREE.Vector3().fromArray(max)
  );
}

function ground(objects: Array<{id: string}> = []) {
  return Object.assign(new THREE.Group(), {
    layout: {environment: {size: [14, 14]}, objects},
    getWorldBounds: vi.fn<(_id: string) => THREE.Box3>(() => new THREE.Box3()),
  });
}

describe('Roomcraft clear standing positions', () => {
  it('prefers a point near the front of an empty ground', () => {
    expect(findClearSpawn([14, 14], [], 1.6).toArray()).toEqual([0, 0, 5.8]);
  });

  it('moves away from a bridge instead of putting the viewer through its deck', () => {
    const bridge = box([-1, 0, 5], [1, 0.8, 6.5]);
    const result = findClearSpawn([14, 14], [bridge], 1.6);
    expect(result).not.toBeNull();
    expect(bridge.clone().expandByScalar(0.35).containsPoint(result)).toBe(
      false
    );
    expect(Math.abs(result.x) + 0.35).toBeLessThan(7);
    expect(Math.abs(result.z) + 0.35).toBeLessThan(7);
    expect(result.y).toBe(0);
  });

  it('reserves shoulder room even when the preferred point itself is outside a wall', () => {
    const wall = box([0.2, 0, 5], [0.8, 2, 6.5]);
    const result = findClearSpawn([14, 14], [wall], 1.6);
    expect(result.toArray()).not.toEqual([0, 0, 5.8]);
    expect(wall.clone().expandByScalar(0.35).containsPoint(result)).toBe(false);
  });

  it('ignores flat paths, shallow water and empty bounds', () => {
    const flat = box([-7, -0.2, -7], [7, 0.08, 7]);
    expect(
      findClearSpawn([14, 14], [flat, new THREE.Box3()], 1.6).toArray()
    ).toEqual([0, 0, 5.8]);
  });

  it('allows overhead geometry only when it clears the viewer and head margin', () => {
    const roof = box([-7, 2.1, -7], [7, 2.5, 7]);
    expect(findClearSpawn([14, 14], [roof], 1.6)).not.toBeNull();
    expect(findClearSpawn([14, 14], [roof], 2.0)).toBeNull();
  });

  it('returns null rather than standing outside a fully blocked or too-small ground', () => {
    expect(
      findClearSpawn([4, 4], [box([-3, 0, -3], [3, 3, 3])], 1.6)
    ).toBeNull();
    expect(findClearSpawn([0.8, 0.8], [], 1.6)).toBeNull();
  });

  it('is deterministic and preserves the provided dimensions and bounds', () => {
    const size = [14, 14];
    const obstacle = box([-1, 0, 5], [1, 0.8, 6.5]);
    const before = obstacle.clone();
    const first = findClearSpawn(size, [obstacle], 1.6);
    expect(findClearSpawn(size, [obstacle], 1.6).equals(first)).toBe(true);
    expect(obstacle.equals(before)).toBe(true);
    expect(size).toEqual([14, 14]);
  });

  it.each([
    [null, [], 1.6],
    [new Array(2), [], 1.6],
    [[14], [], 1.6],
    [[14, 14, 14], [], 1.6],
    [[0, 14], [], 1.6],
    [[-4, 14], [], 1.6],
    [[NaN, 14], [], 1.6],
    [[Infinity, 14], [], 1.6],
    [[14, 14], null, 1.6],
    [[14, 14], new Array(1), 1.6],
    [[14, 14], [{}], 1.6],
    [[14, 14], [], 0],
    [[14, 14], [], NaN],
    [[14, 14], [], Infinity],
    [[14, 14], [box([NaN, 0, 0], [1, 1, 1])], 1.6],
    [[14, 14], [box([0, 0, 0], [Infinity, 1, 1])], 1.6],
  ])('rejects malformed direct inputs (%#)', (size, obstacles, height) => {
    expect(() => findClearSpawn(size, obstacles, height)).toThrow();
  });
});

describe('Roomcraft world-space entry positions', () => {
  it('keeps clearance in metres under translation, yaw and nonuniform scene scale', () => {
    const room = ground();
    room.position.set(3, 2, -4);
    room.rotation.y = Math.PI / 2;
    room.scale.set(2, 3, 0.5);
    const before = {
      position: room.position.clone(),
      rotation: room.quaternion.clone(),
      scale: room.scale.clone(),
    };
    const spawn = getWorldSpawn(room, 1.6);
    expect(spawn.position.x).toBeCloseTo(5.3);
    expect(spawn.position.y).toBe(2);
    expect(spawn.position.z).toBeCloseTo(-4);
    expect(spawn.heading).toBeCloseTo(Math.PI / 2);
    expect(room.position.equals(before.position)).toBe(true);
    expect(room.quaternion.equals(before.rotation)).toBe(true);
    expect(room.scale.equals(before.scale)).toBe(true);
  });

  it('uses per-object envelopes without including ground or sky and preserves bounds', () => {
    const room = ground([{id: 'bridge'}]);
    const bridge = box([-1, 0, 5], [1, 0.8, 6.5]);
    const before = bridge.clone();
    room.getWorldBounds.mockReturnValue(bridge);
    const spawn = getWorldSpawn(room, 1.6);
    expect(room.getWorldBounds).toHaveBeenCalledExactlyOnceWith('bridge');
    expect(
      bridge.clone().expandByScalar(0.35).containsPoint(spawn.position)
    ).toBe(false);
    expect(bridge.equals(before)).toBe(true);
  });

  it('reports a blocked world instead of inventing an outside-ground fallback', () => {
    const room = ground([{id: 'wall'}]);
    room.getWorldBounds.mockReturnValue(box([-9, 0, -9], [9, 3, 9]));
    expect(() => getWorldSpawn(room, 1.6)).toThrow('No clear entry position');
  });

  it('rejects degenerate, tilted and sheared ground transforms', () => {
    const flat = ground();
    flat.scale.x = 0;
    expect(() => getWorldSpawn(flat, 1.6)).toThrow('invalid transform');
    const tilted = ground();
    tilted.rotation.x = Math.PI / 6;
    expect(() => getWorldSpawn(tilted, 1.6)).toThrow('must be level');
    const sheared = ground();
    sheared.matrixAutoUpdate = false;
    sheared.matrix.elements[8] = 0.5;
    expect(() => getWorldSpawn(sheared, 1.6)).toThrow('not sheared');
  });
});
