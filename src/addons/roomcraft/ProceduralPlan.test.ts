import {describe, expect, it} from 'vitest';

import {
  SCENE_PLAN_SCHEMA,
  applyScenePlan,
  assertPlanFresh,
  buildScenePrompt,
  cloneSceneObject,
  readSceneLayout,
  readScenePlan,
} from './ScenePlan';
import {
  MAX_OBJECT_PARTS,
  MAX_PART_DEPTH,
  MAX_SCENE_PARTS,
  type SceneAssetDescription,
  type SceneLayout,
  type SceneObject,
  type SceneObjectChanges,
  type ScenePart,
  type ScenePartEdit,
  type ScenePartMotion,
  type ScenePlan,
  type SceneProceduralObject,
  type SceneSwingMotion,
} from './SceneTypes';

const catalog: SceneAssetDescription[] = [
  {id: 'box', description: 'A box', size: [1, 1, 1]},
];

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

function design(
  overrides: Partial<SceneProceduralObject> = {}
): SceneProceduralObject {
  return {
    id: 'robot',
    name: 'Little robot',
    position: [1, 0, -1],
    rotation: 0.3,
    scale: [1, 1.5, 1],
    color: '#ffffff',
    parts: [
      part(),
      part({
        id: 'arm',
        name: 'Arm',
        shape: 'capsule',
        parent: 'body',
        position: [0.3, 0, 0],
        size: [0.1, 0.4, 0.1],
      }),
    ],
    ...overrides,
  };
}

function scene(...objects: SceneObject[]): SceneLayout {
  return {title: 'Workshop', objects};
}

function refine(
  partEdits: ScenePartEdit[],
  changes: SceneObjectChanges = {}
): ScenePlan {
  return {
    title: 'Workshop',
    edits: [{op: 'update', id: 'robot', changes, partEdits}],
  };
}

function swing(overrides: Partial<SceneSwingMotion> = {}): SceneSwingMotion {
  return {
    kind: 'swing',
    axis: 'z',
    pivot: [0, 0.2, 0],
    amplitude: 0.6,
    period: 2,
    ...overrides,
  };
}

function movingDesign(motion: ScenePartMotion = swing()) {
  const object = design();
  object.parts[1].motion = motion;
  return object;
}

describe('procedural scene definitions', () => {
  it('accepts a new design without a catalog entry and detaches all nested data', () => {
    const source = scene(design());
    const result = readSceneLayout(JSON.stringify(source), []);
    expect(result).toEqual(source);
    expect(result.objects[0]).not.toHaveProperty('asset');
    const parts = result.objects[0].parts!;
    parts[0].position[0] = 4;
    parts[0].size[0] = 2;
    parts[0].rotation[1] = 1;
    parts[1].color = '#000000';
    expect(source.objects[0].parts).toEqual(design().parts);
  });

  describe('procedural motion protocol', () => {
    it('accepts swing and signed spin definitions without changing authored poses', () => {
      for (const motion of [
        swing(),
        {
          kind: 'spin',
          axis: 'y',
          pivot: [-0.1, 0, 0],
          speed: -2,
          phase: 0.25,
        },
      ] satisfies ScenePartMotion[]) {
        const source = scene(movingDesign(motion));
        expect(readSceneLayout(JSON.stringify(source), [])).toEqual(source);
      }
      expect(readSceneLayout(scene(design()), [])).toEqual(scene(design()));
      const withNull = {
        title: 'Workshop',
        objects: [{...design(), parts: [{...part(), motion: null}]}],
      };
      expect(
        readSceneLayout(withNull, []).objects[0].parts![0]
      ).not.toHaveProperty('motion');
    });

    it('detaches motion definitions and pivots in parsed and cloned snapshots', () => {
      const source = scene(movingDesign());
      const parsed = readSceneLayout(source, []);
      const clone = cloneSceneObject(parsed.objects[0]);
      parsed.objects[0].parts![1].motion!.pivot[0] = 4;
      expect(source.objects[0].parts![1].motion!.pivot).toEqual([0, 0.2, 0]);
      expect(clone.parts![1].motion!.pivot).toEqual([0, 0.2, 0]);
      clone.parts![1].motion!.phase = 0.5;
      expect(source.objects[0].parts![1].motion).not.toHaveProperty('phase');
      expect(parsed.objects[0].parts![1].motion).not.toHaveProperty('phase');
    });

    it.each([
      {kind: 'execute'},
      {axis: 'world-up'},
      {pivot: [0, 0]},
      {pivot: [0, -5.01, 0]},
      {pivot: [0, NaN, 0]},
      {amplitude: 0},
      {amplitude: -0.1},
      {amplitude: Math.PI + 0.01},
      {amplitude: Infinity},
      {amplitude: '0.5'},
      {period: 0},
      {period: 0.24},
      {period: 60.01},
      {period: NaN},
      {phase: -0.01},
      {phase: 1.01},
      {phase: null},
      {speed: 1},
      {code: 'return 1'},
    ])('rejects invalid swing data: %j', (changes) => {
      expect(() =>
        readSceneLayout(
          {
            title: 'Workshop',
            objects: [
              {
                ...design(),
                parts: [{...part(), motion: {...swing(), ...changes}}],
              },
            ],
          },
          []
        )
      ).toThrow();
    });

    it.each([
      {speed: 0},
      {speed: Math.PI * 4 + 0.01},
      {speed: -Math.PI * 4 - 0.01},
      {speed: Infinity},
      {speed: '1'},
      {period: 2},
      {amplitude: 0.5},
    ])('rejects invalid spin data: %j', (changes) => {
      expect(() =>
        readSceneLayout(
          {
            title: 'Workshop',
            objects: [
              {
                ...design(),
                parts: [
                  {
                    ...part(),
                    motion: {
                      kind: 'spin',
                      axis: 'x',
                      pivot: [0, 0, 0],
                      speed: 1,
                      ...changes,
                    },
                  },
                ],
              },
            ],
          },
          []
        )
      ).toThrow();
    });

    it.each(['kind', 'axis', 'pivot', 'amplitude', 'period'])(
      'requires the %s field in a swing definition',
      (field) => {
        const incomplete = Object.fromEntries(
          Object.entries(swing()).filter(([key]) => key !== field)
        );
        expect(() =>
          readSceneLayout(
            {
              title: 'Workshop',
              objects: [
                {...design(), parts: [{...part(), motion: incomplete}]},
              ],
            },
            []
          )
        ).toThrow();
      }
    );

    it('preserves motion in geometry edits, replaces it explicitly, and removes it with null', () => {
      const before = scene(movingDesign());
      const resized = applyScenePlan(
        refine([{op: 'update', id: 'arm', changes: {size: [0.1, 0.7, 0.1]}}]),
        before,
        []
      );
      expect(resized.objects[0].parts![1].motion).toEqual(swing());
      expect(resized.objects[0].position).toEqual(before.objects[0].position);
      const faster = applyScenePlan(
        refine([
          {op: 'update', id: 'arm', changes: {motion: swing({period: 1})}},
        ]),
        resized,
        []
      );
      expect(faster.objects[0].parts![1].motion).toEqual(swing({period: 1}));
      const stopped = applyScenePlan(
        refine([{op: 'update', id: 'arm', changes: {motion: null}}]),
        faster,
        []
      );
      expect(stopped.objects[0].parts![1]).not.toHaveProperty('motion');
      expect(before.objects[0].parts![1].motion).toEqual(swing());
    });

    it('rejects overlapping motion edits but preserves a concurrent retune during a size edit', () => {
      const before = scene(movingDesign());
      const now = readSceneLayout(before, []);
      now.objects[0].parts![1].motion = swing({period: 1});
      const motionEdit = refine([
        {op: 'update', id: 'arm', changes: {motion: swing({amplitude: 1})}},
      ]);
      expect(() => assertPlanFresh(motionEdit, before, now)).toThrow(
        'changed while planning'
      );
      const resize = refine([
        {op: 'update', id: 'arm', changes: {size: [0.1, 0.7, 0.1]}},
      ]);
      expect(() => assertPlanFresh(resize, before, now)).not.toThrow();
      expect(
        applyScenePlan(resize, now, []).objects[0].parts![1].motion
      ).toEqual(swing({period: 1}));
    });

    it('applies the whole-design size budget to motion, not only the rest pose', () => {
      const orbiting = part({
        position: [5, 0, 0],
        motion: {kind: 'spin', axis: 'z', pivot: [5, 0, 0], speed: 1},
      });
      expect(() =>
        readSceneLayout(scene(design({parts: [orbiting]})), [])
      ).toThrow('10');
    });

    it('teaches rest poses, attached moving children, bounded behaviors, and explicit stopping', () => {
      const prompt = buildScenePrompt({
        prompt: 'Make this wave, then give it longer arms.',
        selectedId: 'robot',
        scene: scene(movingDesign()),
        catalog: [],
      });
      expect(prompt).toContain('authored rest pose');
      expect(prompt).toContain('pivot');
      expect(prompt).toContain('motion:null');
      expect(prompt).toContain('parent moving hands');
      expect(prompt).toContain('radians per second');
      expect(prompt).toContain('never output animation code');
    });
  });

  it('requires exactly one content source', () => {
    for (const value of [
      {...design(), asset: 'box'},
      {...design(), asset: 'procedural'},
      {...design(), asset: undefined},
      {...design(), parts: undefined},
      {...design(), parts: null},
      {...design(), parts: []},
      {
        id: 'missing',
        name: 'Missing',
        position: [0, 0, 0],
        rotation: 0,
        scale: [1, 1, 1],
        color: '#ffffff',
      },
    ]) {
      expect(() =>
        readSceneLayout({title: 'Workshop', objects: [value]}, catalog)
      ).toThrow();
    }
  });

  it.each([
    {id: '__proto__'},
    {name: ''},
    {shape: 'generated-javascript'},
    {parent: 'Invalid Parent'},
    {position: [0, 6, 0]},
    {position: [0, NaN, 0]},
    {rotation: [0, 0]},
    {rotation: [0, Infinity, 0]},
    {size: [0, 1, 1]},
    {size: [1, 6, 1]},
    {color: 'blue'},
    {url: 'https://example.com/model.glb'},
    {code: 'new Function("return 1")'},
  ])('rejects malformed or executable part input: %j', (changes) => {
    expect(() =>
      readSceneLayout(
        {
          title: 'Workshop',
          objects: [{...design(), parts: [{...part(), ...changes}]}],
        },
        []
      )
    ).toThrow();
  });

  it.each([
    'id',
    'name',
    'shape',
    'parent',
    'position',
    'rotation',
    'size',
    'color',
  ])('requires the %s field on a new part', (field) => {
    const incomplete = Object.fromEntries(
      Object.entries(part()).filter(([key]) => key !== field)
    );
    expect(() =>
      readSceneLayout(
        {title: 'Workshop', objects: [{...design(), parts: [incomplete]}]},
        []
      )
    ).toThrow('Missing scene field');
  });

  it('allows signed local centers, full rotations and forward parent references', () => {
    const child = part({
      id: 'backpack',
      parent: 'body',
      position: [0, -0.1, -0.25],
      rotation: [0.2, -0.5, 0.1],
    });
    expect(
      readSceneLayout(scene(design({parts: [child, part()]})), []).objects[0]
        .parts
    ).toEqual([child, part()]);
  });

  it('rejects invalid parent forests and oversized nested designs', () => {
    const tooDeep = Array.from({length: MAX_PART_DEPTH + 1}, (_, index) =>
      part({
        id: `part-${index}`,
        parent: index ? `part-${index - 1}` : null,
        position: [0, 0, 0],
      })
    );
    for (const parts of [
      [part(), part()],
      [part({parent: 'missing'})],
      [part({parent: 'body'})],
      [part({parent: 'arm'}), part({id: 'arm', parent: 'body'})],
      tooDeep,
      [
        part({position: [5, 0, 0]}),
        part({id: 'far', parent: 'body', position: [5, 0, 0]}),
      ],
    ]) {
      expect(() => readSceneLayout(scene(design({parts})), [])).toThrow();
    }
  });

  it('enforces per-object and scene-wide geometry budgets', () => {
    const parts = Array.from({length: MAX_OBJECT_PARTS}, (_, index) =>
      part({id: `part-${index}`})
    );
    expect(() =>
      readSceneLayout(
        scene(design({parts: [...parts, part({id: 'extra'})]})),
        []
      )
    ).toThrow('48');
    const objects = Array.from(
      {length: MAX_SCENE_PARTS / MAX_OBJECT_PARTS},
      (_, index) => design({id: `robot-${index}`, parts})
    );
    const full = scene(...objects);
    expect(readSceneLayout(full, [])).toEqual(full);
    expect(() =>
      readSceneLayout(scene(...objects, design({id: 'extra'})), [])
    ).toThrow('384');
    expect(() =>
      applyScenePlan(
        {
          title: full.title,
          edits: [{op: 'add', object: design({id: 'extra'})}],
        },
        full,
        []
      )
    ).toThrow('384');
    const exported = JSON.stringify(full, null, 2);
    expect(exported.length).toBeGreaterThan(100_000);
    expect(readSceneLayout(exported, [])).toEqual(full);
    expect(() => readSceneLayout(' '.repeat(500_001), [])).toThrow('too large');
  });
});

describe('targeted procedural refinement', () => {
  it('lengthens an arm and adds a backpack without rewriting the body or pose', () => {
    const before = scene(design());
    const result = applyScenePlan(
      refine([
        {op: 'update', id: 'arm', changes: {size: [0.1, 0.8, 0.1]}},
        {
          op: 'add',
          part: part({
            id: 'backpack',
            name: 'Backpack',
            parent: 'body',
            position: [0, 0, -0.3],
            size: [0.3, 0.3, 0.2],
          }),
        },
      ]),
      before,
      []
    );
    const updated = result.objects[0];
    expect(updated.parts).toHaveLength(3);
    expect(updated.parts![0]).toEqual(before.objects[0].parts![0]);
    expect(updated.parts![1].size).toEqual([0.1, 0.8, 0.1]);
    expect(updated.position).toEqual(before.objects[0].position);
    expect(updated.rotation).toEqual(before.objects[0].rotation);
    expect(updated.scale).toEqual(before.objects[0].scale);
    expect(before.objects[0].parts![1].size).toEqual([0.1, 0.4, 0.1]);
  });

  it('supports connected additions, reparenting, and explicit removal in one transaction', () => {
    const result = applyScenePlan(
      refine([
        {op: 'add', part: part({id: 'finger', parent: 'hand'})},
        {op: 'add', part: part({id: 'hand', parent: 'body'})},
        {op: 'update', id: 'arm', changes: {parent: 'hand'}},
      ]),
      scene(design()),
      []
    );
    expect(result.objects[0].parts?.map((part) => part.id)).toEqual([
      'body',
      'arm',
      'finger',
      'hand',
    ]);
    expect(() =>
      applyScenePlan(refine([{op: 'remove', id: 'hand'}]), result, [])
    ).toThrow();
    const removed = applyScenePlan(
      refine([
        {op: 'remove', id: 'hand'},
        {op: 'remove', id: 'finger'},
        {op: 'update', id: 'arm', changes: {parent: 'body'}},
      ]),
      result,
      []
    );
    expect(removed.objects[0].parts?.map((part) => part.id)).toEqual([
      'body',
      'arm',
    ]);
  });

  it('requires targeted part updates to be nonempty, unique and well formed', () => {
    for (const partEdits of [
      [],
      [{op: 'update', id: 'body', changes: {}}],
      [{op: 'update', id: 'body', changes: {id: 'renamed'}}],
      [
        {op: 'remove', id: 'body'},
        {op: 'remove', id: 'body'},
      ],
      [{op: 'execute', code: 'return 1'}],
      Array.from({length: 97}, (_, index) => ({
        op: 'remove',
        id: `part-${index}`,
      })),
    ]) {
      expect(() =>
        readScenePlan(
          {
            title: 'Workshop',
            edits: [{op: 'update', id: 'robot', changes: {}, partEdits}],
          },
          []
        )
      ).toThrow();
    }
    expect(() =>
      readScenePlan(refine([{op: 'remove', id: 'arm'}], {parts: [part()]}), [])
    ).toThrow('same operation');
    expect(() =>
      readScenePlan(
        refine([{op: 'remove', id: 'arm'}], {asset: 'box'}),
        catalog
      )
    ).toThrow('same operation');
  });

  it('rejects missing parts, duplicate additions, cycles, and empty final designs', () => {
    for (const edits of [
      [{op: 'remove', id: 'missing'}],
      [{op: 'add', part: part()}],
      [{op: 'update', id: 'body', changes: {parent: 'arm'}}],
      [{op: 'remove', id: 'body'}],
      [
        {op: 'remove', id: 'body'},
        {op: 'remove', id: 'arm'},
      ],
    ] satisfies ScenePartEdit[][]) {
      const before = scene(design());
      expect(() => applyScenePlan(refine(edits), before, [])).toThrow();
      expect(before).toEqual(scene(design()));
    }
  });

  it('switches content sources explicitly while preserving the object identity', () => {
    const original = scene(design());
    const asAsset = applyScenePlan(
      {
        title: 'Workshop',
        edits: [{op: 'update', id: 'robot', changes: {asset: 'box'}}],
      },
      original,
      catalog
    );
    expect(asAsset.objects[0].asset).toBe('box');
    expect(asAsset.objects[0]).not.toHaveProperty('parts');
    expect(() =>
      applyScenePlan(refine([{op: 'remove', id: 'arm'}]), asAsset, catalog)
    ).toThrow('not a procedural design');
    const restored = applyScenePlan(
      {
        title: 'Workshop',
        edits: [{op: 'update', id: 'robot', changes: {parts: design().parts}}],
      },
      asAsset,
      catalog
    );
    expect(restored).toEqual(original);
    expect(restored.objects[0]).not.toHaveProperty('asset');
  });

  it('preserves unrelated concurrent hand and part edits but rejects overlapping changes', () => {
    const before = scene(design());
    const now = readSceneLayout(before, []);
    now.objects[0].position[0] = 20;
    now.objects[0].parts![0].color = '#0000ff';
    const plan = refine([
      {op: 'update', id: 'arm', changes: {size: [0.1, 0.8, 0.1]}},
    ]);
    expect(() => assertPlanFresh(plan, before, now)).not.toThrow();
    const result = applyScenePlan(plan, now, []);
    expect(result.objects[0].position[0]).toBe(20);
    expect(result.objects[0].parts![0].color).toBe('#0000ff');
    now.objects[0].parts![1].size[1] = 0.6;
    expect(() => assertPlanFresh(plan, before, now)).toThrow(
      'changed while planning'
    );
    expect(() =>
      assertPlanFresh(refine([{op: 'remove', id: 'body'}]), before, now)
    ).toThrow('changed while planning');
    expect(() =>
      assertPlanFresh(
        {
          title: 'Workshop',
          edits: [{op: 'update', id: 'robot', changes: {asset: 'box'}}],
        },
        before,
        now
      )
    ).toThrow('changed while planning');
  });

  it('does not turn a no-op part update into a new scene', () => {
    const before = scene(design());
    expect(
      applyScenePlan(
        refine([{op: 'update', id: 'arm', changes: {size: [0.1, 0.4, 0.1]}}]),
        before,
        []
      )
    ).toEqual(before);
  });

  it('teaches the part protocol without costly collection caps in the provider schema', () => {
    const prompt = buildScenePrompt({
      prompt: 'Give this longer arms and a backpack.',
      selectedId: 'robot',
      scene: scene(design()),
      catalog: [],
    });
    expect(prompt).toContain('partEdits');
    expect(prompt).toContain('OMIT asset entirely');
    expect(prompt).toContain('Keep the authored origin stable');
    expect(prompt).toContain('384 procedural parts');
    const caps = [
      ...JSON.stringify(SCENE_PLAN_SCHEMA).matchAll(/"maxItems":(\d+)/g),
    ];
    expect(caps.length).toBeGreaterThan(0);
    expect(caps.every(([, value]) => value === '3')).toBe(true);
  });
});
