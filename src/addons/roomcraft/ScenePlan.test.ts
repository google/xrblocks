import {describe, expect, it} from 'vitest';

import {
  MAX_SCENE_OBJECTS,
  SCENE_PLAN_SCHEMA,
  applyScenePlan,
  assertPlanFresh,
  buildScenePrompt,
  readSceneLayout,
  readScenePlan,
} from './ScenePlan';
import type {
  SceneAssetDescription,
  SceneCatalogObject,
  SceneLayout,
  SceneObject,
  ScenePlan,
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

function addPlan(value: unknown): unknown {
  return {title: 'Studio', edits: [{op: 'add', object: value}]};
}

describe('Roomcraft scene protocol', () => {
  it('accepts JSON objects, plain JSON, and a single JSON code fence', () => {
    const plan = addPlan(object());
    for (const input of [
      plan,
      JSON.stringify(plan),
      `\`\`\`json\n${JSON.stringify(plan)}\n\`\`\``,
    ]) {
      expect(readScenePlan(input, catalog)).toEqual(plan);
    }
    expect(SCENE_PLAN_SCHEMA.properties.edits.items.anyOf).toHaveLength(3);
  });

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

  it('normalizes names and colors without mutating the input', () => {
    const input = scene(object({name: '  First box  ', color: '#AABBCC'}));
    const result = readSceneLayout(input, catalog);
    expect(result.objects[0].name).toBe('First box');
    expect(result.objects[0].color).toBe('#aabbcc');
    result.objects[0].position[0] = 2;
    expect(input.objects[0].position).toEqual([0, 0, 0]);
    expect(input.objects[0].name).toBe('  First box  ');
  });

  it.each([
    {id: '__proto__'},
    {id: 'MixedCase'},
    {id: 'a'.repeat(49)},
    {name: ''},
    {name: 'x'.repeat(81)},
    {asset: 'invented-model'},
    {asset: 'https://example.com/model.glb'},
    {position: [0, 0]},
    {position: [0, 0, 0, 0]},
    {position: ['0', 0, 0]},
    {position: [0, -0.1, 0]},
    {position: [10.01, 0, 0]},
    {position: [NaN, 0, 0]},
    {scale: [0, 1, 1]},
    {scale: [-1, 1, 1]},
    {scale: [1, 6, 1]},
    {rotation: Infinity},
    {rotation: Math.PI * 3},
    {color: 'red'},
    {color: '#abc'},
    {url: 'https://example.com/model.glb'},
    {code: 'console.log("not a scene")'},
  ])('rejects invalid or unsupported object values: %j', (changes) => {
    expect(() =>
      readScenePlan(addPlan({...object(), ...changes}), catalog)
    ).toThrow();
  });

  it.each([
    null,
    [],
    '',
    'This is not JSON',
    'Here is a scene:\n```json\n{}\n```',
    ' '.repeat(100_001),
    {title: 'Studio', edits: [], script: 'alert(1)'},
    {title: 'Studio', edits: [{op: 'execute', code: 'alert(1)'}]},
    {title: 'Studio', edits: [{op: 'update', id: 'first', changes: {}}]},
    {
      title: 'Studio',
      edits: [{op: 'update', id: 'first', changes: {id: 'new'}}],
    },
    {title: 'Studio', edits: [{op: 'remove'}]},
  ])('rejects malformed plans: %j', (plan) => {
    expect(() => readScenePlan(plan, catalog)).toThrow();
  });

  it('requires every field for a newly added object', () => {
    const {color: _color, ...incomplete} = object();
    expect(() => readScenePlan(addPlan(incomplete), catalog)).toThrow(
      'Missing scene field "color"'
    );
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

  it('keeps the edit cap in the prompt instead of the nested provider schema', () => {
    expect(SCENE_PLAN_SCHEMA.properties.edits).not.toHaveProperty('maxItems');
    expect(
      buildScenePrompt({
        prompt: 'Create a reading corner.',
        scene: scene(),
        selectedId: null,
        catalog,
      })
    ).toContain('at most 96 edits');
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

  it('does not erase trusted hand transforms outside planner input limits', () => {
    const moved = object({position: [11, -0.1, 0]});
    const plan = readScenePlan(
      {
        title: 'Studio',
        edits: [{op: 'update', id: 'first', changes: {color: '#112233'}}],
      },
      catalog
    );
    expect(
      applyScenePlan(plan, scene(moved), catalog).objects[0].position
    ).toEqual(moved.position);
  });

  it('rejects missing update/remove targets and adds that reuse an ID', () => {
    for (const edit of [
      {op: 'update', id: 'missing', changes: {color: '#000000'}},
      {op: 'remove', id: 'missing'},
      {op: 'add', object: object()},
    ]) {
      const plan = readScenePlan({title: 'Studio', edits: [edit]}, catalog);
      expect(() => applyScenePlan(plan, scene(object()), catalog)).toThrow(
        /exist/
      );
    }
  });

  it('allows empty edit plans without clearing the scene', () => {
    const before = scene(object());
    expect(
      applyScenePlan({title: 'Studio', edits: []}, before, catalog)
    ).toEqual(before);
  });

  it('allows hand movement while planning an unrelated color change', () => {
    const plan: ScenePlan = {
      title: 'Studio',
      edits: [{op: 'update', id: 'first', changes: {color: '#ffffff'}}],
    };
    const before = scene(object());
    const now = scene(object({position: [1, 0, 2]}));
    expect(() => assertPlanFresh(plan, before, now)).not.toThrow();
    expect(applyScenePlan(plan, now, catalog).objects[0].position).toEqual([
      1, 0, 2,
    ]);
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

  it('sends explicit context, schema, and limits to the planner', () => {
    const request = {
      prompt: 'Make this blue',
      scene: scene(object({position: [2, 0, 1]})),
      selectedId: 'first',
      catalog,
    };
    const prompt = buildScenePrompt(request);
    expect(prompt).toContain(JSON.stringify(request));
    expect(prompt).toContain(JSON.stringify(SCENE_PLAN_SCHEMA));
    expect(prompt).toContain('Never recreate or repeat untouched objects');
    expect(prompt).toContain('at most 48 objects');
    expect(prompt).toContain('not a room scan');
    expect(prompt).toContain("EACH OBJECT'S local geometry");
    expect(prompt).toContain('not the whole world');
    expect(prompt).toContain('reducing object.scale does not relax');
    expect(prompt).not.toContain('single correction attempt');
  });

  it('teaches one complete correction without shrinking the requested world', () => {
    const request = {
      prompt: 'Build a 20 meter market',
      scene: scene(),
      selectedId: null,
      catalog,
      repair: {reason: 'Procedural geometry exceeds its allowed bounds.'},
    };
    const prompt = buildScenePrompt(request);
    expect(prompt).toContain(JSON.stringify(request));
    expect(prompt).toContain('single correction attempt');
    expect(prompt).toContain('Return a complete compact JSON plan');
    expect(prompt).toContain('Preserve the requested world size and theme');
  });
});
