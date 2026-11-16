import {describe, expect, it} from 'vitest';

import {
  MAX_SCENE_OBJECTS,
  applyScenePlan,
  assertPlanFresh,
  readSceneLayout,
  readScenePlan,
} from './ScenePlan';
import type {
  SceneAssetDescription,
  SceneCatalogObject,
  SceneLayout,
  SceneObject,
} from './SceneTypes';

const catalog: SceneAssetDescription[] = [
  {id: 'box', description: 'A box', size: [0.5, 0.5, 0.5]},
  {id: 'lamp', description: 'A standing lamp', size: [0.5, 1.5, 0.5]},
];

function object(
  overrides: Partial<SceneCatalogObject> = {}
): SceneCatalogObject {
  return {
    id: 'first',
    asset: 'box',
    name: 'First box',
    position: [0, 0, 0],
    rotation: 0,
    scale: [1, 1, 1],
    color: '#aabbcc',
    ...overrides,
  };
}

function scene(...objects: SceneObject[]): SceneLayout {
  return {title: 'Studio', objects};
}

describe('Roomcraft scene protocol', () => {
  it('explains malformed or truncated JSON without accepting partial data', () => {
    for (const input of [
      '{"title":"Studio","edits":[',
      '{"title":"Studio","objects":[}',
      '```json\n{"title":"Studio",\n```',
      'Here is your scene.',
    ]) {
      expect(() => readScenePlan(input, catalog)).toThrow(
        'incomplete or invalid JSON'
      );
      expect(() => readSceneLayout(input, catalog)).toThrow(
        'incomplete or invalid JSON'
      );
    }
  });

  it('rejects duplicate IDs, including contradictory edits', () => {
    expect(() => readSceneLayout(scene(object(), object()), catalog)).toThrow(
      'Duplicate'
    );
    expect(() =>
      readScenePlan(
        {
          title: 'Studio',
          edits: [
            {op: 'update', id: 'first', changes: {color: '#000000'}},
            {op: 'remove', id: 'first'},
          ],
        },
        catalog
      )
    ).toThrow('Only one edit');
  });

  it('bounds objects and operations', () => {
    const objects = Array.from({length: MAX_SCENE_OBJECTS + 1}, (_, index) =>
      object({id: `item-${index}`})
    );
    expect(() => readSceneLayout(scene(...objects), catalog)).toThrow(
      'at most 48'
    );
    expect(() =>
      readScenePlan(
        {
          title: 'Studio',
          edits: Array.from({length: 97}, () => ({op: 'remove', id: 'first'})),
        },
        catalog
      )
    ).toThrow('at most 96');
    expect(() =>
      applyScenePlan(
        {title: 'Studio', edits: [{op: 'add', object: objects.at(-1)!}]},
        scene(...objects.slice(0, -1)),
        catalog
      )
    ).toThrow('at most 48');
  });
});

describe('incremental scene edits', () => {
  it('adds, updates, and removes only explicitly named objects', () => {
    const first = object();
    const second = object({id: 'second', position: [1, 0, 1]});
    const third = object({id: 'third'});
    const before = scene(first, second, third);
    const plan = readScenePlan(
      {
        title: 'Warm studio',
        edits: [
          {op: 'update', id: 'first', changes: {color: '#FF8800'}},
          {op: 'remove', id: 'third'},
          {op: 'add', object: object({id: 'lamp-one', asset: 'lamp'})},
        ],
      },
      catalog
    );
    const result = applyScenePlan(plan, before, catalog);
    expect(result.title).toBe('Warm studio');
    expect(result.objects.map((item) => item.id)).toEqual([
      'first',
      'second',
      'lamp-one',
    ]);
    expect(result.objects[0]).toEqual({...first, color: '#ff8800'});
    expect(result.objects[1]).toEqual(second);
    expect(before).toEqual(scene(first, second, third));
  });

  it('rejects stale position changes and removals rather than overwriting a hand edit', () => {
    const before = scene(object());
    const now = scene(object({position: [1, 0, 2]}));
    for (const edit of [
      {op: 'update', id: 'first', changes: {position: [2, 0, 1]}},
      {op: 'remove', id: 'first'},
    ]) {
      const plan = readScenePlan({title: 'Studio', edits: [edit]}, catalog);
      expect(() => assertPlanFresh(plan, before, now)).toThrow(
        'changed while planning'
      );
    }
  });
});
