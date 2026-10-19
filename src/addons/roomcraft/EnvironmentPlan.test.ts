import {describe, expect, it} from 'vitest';

import {
  applyScenePlan,
  assertPlanFresh,
  buildScenePrompt,
  readSceneLayout,
  readScenePlan,
} from './ScenePlan';
import {
  MAX_SCENE_SCATTER_COUNT,
  SCENE_SCATTER_STYLES,
  SCENE_TIMES_OF_DAY,
  type SceneAssetDescription,
  type SceneEnvironment,
  type SceneLandscape,
  type SceneLandscapeObject,
  type SceneLayout,
  type SceneObject,
  type SceneObjectChanges,
  type ScenePond,
  type ScenePlan,
  type SceneScatter,
} from './SceneTypes';

const catalog: SceneAssetDescription[] = [
  {id: 'box', description: 'A box', size: [1, 1, 1]},
];

function environment(): SceneEnvironment {
  return {size: [14, 12], groundColor: '#40513a', timeOfDay: 'moonlight'};
}

function pond(): ScenePond {
  return {kind: 'pond', size: [3, 2], bankWidth: 0.25};
}

function planting(): SceneScatter {
  return {
    kind: 'scatter',
    style: 'tree',
    size: [4, 3],
    count: 24,
    seed: 17,
    height: 2.5,
  };
}

function feature(
  landscape: SceneLandscape = pond(),
  overrides: Partial<SceneLandscapeObject> = {}
): SceneLandscapeObject {
  return {
    id: 'pond',
    name: 'Garden feature',
    position: [-1, 0, -1],
    rotation: 0,
    scale: [1, 1, 1],
    color: '#397a80',
    landscape,
    ...overrides,
  };
}

function scene(...objects: SceneObject[]): SceneLayout {
  return {title: 'Moonlit garden', environment: environment(), objects};
}

describe('Roomcraft environment protocol', () => {
  it('accepts documented parameter boundaries, including centimeter-spaced path points', () => {
    const input = scene(
      feature({kind: 'pond', size: [0.2, 20], bankWidth: 0.05}),
      feature(
        {
          kind: 'path',
          points: [
            [-10, -10],
            [-9.98, -10],
            [10, 10],
          ],
          width: 0.15,
        },
        {id: 'path'}
      ),
      feature(
        {
          ...planting(),
          size: [20, 0.2],
          count: 128,
          seed: 2147483647,
          height: 6,
        },
        {id: 'trees'}
      )
    );
    input.environment = {...environment(), size: [4, 20]};
    expect(readSceneLayout(input, [])).toEqual(input);
  });

  it('round-trips a complete virtual setting and all landscape recipes', () => {
    const input = scene(
      feature(),
      feature(
        {
          kind: 'path',
          points: [
            [0, 0],
            [1, -1],
            [0, -3],
          ],
          width: 0.8,
        },
        {id: 'path'}
      ),
      ...SCENE_SCATTER_STYLES.map((style) =>
        feature({...planting(), style}, {id: style})
      )
    );
    expect(readSceneLayout(JSON.stringify(input), [])).toEqual(input);
    for (const timeOfDay of SCENE_TIMES_OF_DAY) {
      expect(
        readSceneLayout(
          {...input, environment: {...environment(), timeOfDay}},
          []
        ).environment?.timeOfDay
      ).toBe(timeOfDay);
    }
  });

  it('keeps legacy layouts unchanged and requires a full initial environment', () => {
    expect(readSceneLayout({title: 'Empty', objects: []}, [])).toEqual({
      title: 'Empty',
      objects: [],
    });
    expect(() =>
      applyScenePlan(
        {title: 'New setting', edits: [], environment: {timeOfDay: 'sunrise'}},
        {title: 'Empty', objects: []},
        []
      )
    ).toThrow('size');
    expect(
      applyScenePlan(
        {title: 'New setting', edits: [], environment: environment()},
        {title: 'Empty', objects: []},
        []
      ).environment
    ).toEqual(environment());
  });

  it.each([
    {size: [3, 12]},
    {size: [14, 21]},
    {size: [14]},
    {size: [14, 12, 1]},
    {size: [14, Number.NaN]},
    {groundColor: 'green'},
    {timeOfDay: 'infinite-night'},
    {skyUrl: 'https://example.com/sky.jpg'},
    {script: 'run()'},
  ])('rejects unsupported or unbounded environment fields: %j', (changes) => {
    expect(() =>
      readSceneLayout(
        {...scene(), environment: {...environment(), ...changes}},
        []
      )
    ).toThrow();
    expect(() =>
      readScenePlan({title: 'Garden', edits: [], environment: changes}, [])
    ).toThrow();
  });

  it('patches atmosphere without dropping the ground, objects, or detached ownership', () => {
    const before = scene(feature());
    const after = applyScenePlan(
      {title: before.title, edits: [], environment: {timeOfDay: 'sunrise'}},
      before,
      []
    );
    expect(after.environment).toEqual({...environment(), timeOfDay: 'sunrise'});
    expect(after.objects).toEqual(before.objects);
    after.environment!.size[0] = 20;
    expect(before.environment).toEqual(environment());
    expect(
      applyScenePlan({title: before.title, edits: []}, before, [])
    ).toEqual(before);
    expect(
      applyScenePlan(
        {title: before.title, edits: [], environment: null},
        before,
        []
      )
    ).toEqual({title: before.title, objects: before.objects});
  });

  it('enlarges just the pond while preserving trusted hand transforms and planting seeds', () => {
    const before = scene(feature(), feature(planting(), {id: 'trees'}));
    before.objects[0].position = [25, -2, 0];
    const after = applyScenePlan(
      {
        title: before.title,
        edits: [
          {
            op: 'update',
            id: 'pond',
            changes: {landscape: {...pond(), size: [4, 3]}},
          },
        ],
      },
      before,
      []
    );
    expect(after.objects[0].position).toEqual([25, -2, 0]);
    expect(after.objects[0].landscape).toEqual({...pond(), size: [4, 3]});
    expect(after.objects[1]).toEqual(before.objects[1]);
    expect(after.environment).toEqual(before.environment);
  });

  it.each([
    {kind: 'pond', size: [0, 2], bankWidth: 0.2},
    {kind: 'pond', size: [2, 21], bankWidth: 0.2},
    {kind: 'pond', size: [2, 2], bankWidth: 0},
    {kind: 'pond', size: [2, 2], bankWidth: 1.01},
    {kind: 'pond', size: [2, 2], bankWidth: 0.2, count: 2},
    {kind: 'path', points: [[0, 0]], width: 1},
    {
      kind: 'path',
      points: [
        [0, 0],
        [0.01, 0],
      ],
      width: 1,
    },
    {
      kind: 'path',
      points: [
        [0, 0],
        [11, 0],
      ],
      width: 1,
    },
    {
      kind: 'path',
      points: [
        [0, 0],
        [1, 0],
      ],
      width: 4,
    },
    {
      kind: 'path',
      points: [
        [0, 0],
        [1, 0, 0],
      ],
      width: 1,
    },
    {
      kind: 'path',
      points: Array.from({length: 13}, (_, i) => [i / 10, 0]),
      width: 1,
    },
    {...planting(), count: 0},
    {...planting(), count: 129},
    {...planting(), count: 1.5},
    {...planting(), seed: -1},
    {...planting(), seed: 0.5},
    {...planting(), seed: 2147483648},
    {...planting(), height: 6.1},
    {...planting(), height: Number.POSITIVE_INFINITY},
    {...planting(), style: 'downloaded-tree'},
    {...planting(), modelUrl: 'https://example.com/tree.glb'},
  ])('rejects invalid or unsupported landscape data: %j', (landscape) => {
    expect(() =>
      readSceneLayout(
        {title: 'Garden', objects: [{...feature(), landscape}]},
        []
      )
    ).toThrow();
  });

  it('deeply detaches path coordinates, feature sizes, and environment dimensions', () => {
    const input = scene(
      feature(),
      feature(
        {
          kind: 'path',
          points: [
            [0, 0],
            [1, -1],
          ],
          width: 1,
        },
        {id: 'path'}
      )
    );
    const output = readSceneLayout(input, []);
    const water = output.objects[0].landscape;
    const path = output.objects[1].landscape;
    if (water?.kind !== 'pond' || path?.kind !== 'path')
      throw new Error('Wrong recipe.');
    water.size[0] = 9;
    path.points[0][0] = 9;
    output.environment!.size[0] = 20;
    expect(input).toEqual(
      scene(
        feature(),
        feature(
          {
            kind: 'path',
            points: [
              [0, 0],
              [1, -1],
            ],
            width: 1,
          },
          {id: 'path'}
        )
      )
    );
  });

  it('bounds total scattered specimens rather than only the number of scene objects', () => {
    const objects = Array.from({length: 8}, (_, i) =>
      feature({...planting(), count: 128}, {id: `grove-${i}`})
    );
    expect(readSceneLayout(scene(...objects), []).objects).toHaveLength(8);
    expect(() =>
      applyScenePlan(
        {
          title: 'Garden',
          edits: [{op: 'add', object: feature({...planting(), count: 1})}],
        },
        scene(...objects),
        []
      )
    ).toThrow(String(MAX_SCENE_SCATTER_COUNT));
  });

  it('requires exactly one source and removes obsolete source fields on replacement', () => {
    const {landscape: _landscape, ...base} = feature();
    const sources: SceneObject[] = [
      feature(),
      {...base, asset: 'box'},
      {
        ...base,
        parts: [
          {
            id: 'body',
            name: 'Body',
            shape: 'box',
            parent: null,
            position: [0, 0.5, 0],
            rotation: [0, 0, 0],
            size: [1, 1, 1],
            color: '#ffffff',
          },
        ],
      },
    ];
    const changes = (object: SceneObject): SceneObjectChanges => {
      if (object.landscape) return {landscape: object.landscape};
      if (object.parts) return {parts: object.parts};
      return {asset: object.asset};
    };
    for (const from of sources) {
      for (const to of sources) {
        const result = applyScenePlan(
          {
            title: 'Garden',
            edits: [{op: 'update', id: from.id, changes: changes(to)}],
          },
          scene(from),
          catalog
        ).objects[0];
        expect(
          ['asset', 'parts', 'landscape'].filter((key) => key in result)
        ).toEqual(['asset', 'parts', 'landscape'].filter((key) => key in to));
      }
    }
    for (const invalid of [
      {...feature(), asset: 'box'},
      {...feature(), parts: []},
      base,
    ]) {
      expect(() =>
        readSceneLayout({title: 'Garden', objects: [invalid]}, catalog)
      ).toThrow('exactly one');
    }
    expect(() =>
      readScenePlan(
        {
          title: 'Garden',
          edits: [
            {
              op: 'update',
              id: 'pond',
              changes: {landscape: pond()},
              partEdits: [{op: 'remove', id: 'body'}],
            },
          ],
        },
        []
      )
    ).toThrow('replace object content');
  });

  it('rejects overlapping atmosphere edits but preserves unrelated changes', () => {
    const before = scene(feature());
    const plan = {
      title: before.title,
      edits: [],
      environment: {timeOfDay: 'sunrise' as const},
    };
    const unrelated = {
      ...before,
      environment: {...environment(), groundColor: '#123456'},
    };
    expect(() => assertPlanFresh(plan, before, unrelated)).not.toThrow();
    expect(applyScenePlan(plan, unrelated, []).environment?.groundColor).toBe(
      '#123456'
    );
    const changed = {
      ...before,
      environment: {...environment(), timeOfDay: 'sunset' as const},
    };
    expect(() => assertPlanFresh(plan, before, changed)).toThrow('environment');
    expect(() =>
      assertPlanFresh({...plan, environment: null}, before, unrelated)
    ).toThrow('environment');
  });

  it('rejects stale source replacements after landscape edits or source changes', () => {
    const before = scene(feature());
    const plan: ScenePlan = {
      title: before.title,
      edits: [{op: 'update', id: 'pond', changes: {asset: 'box'}}],
    };
    const resized = scene(feature({...pond(), size: [4, 2]}));
    expect(() => assertPlanFresh(plan, before, resized)).toThrow('changed');
    const {landscape: _landscape, ...base} = feature();
    const replaced = scene({...base, asset: 'box'});
    expect(() => assertPlanFresh(plan, before, replaced)).toThrow('changed');
    expect(() => assertPlanFresh(plan, before, before)).not.toThrow();
  });

  it('does not apply part edits to a landscape feature', () => {
    expect(() =>
      applyScenePlan(
        {
          title: 'Garden',
          edits: [
            {
              op: 'update',
              id: 'pond',
              changes: {},
              partEdits: [{op: 'remove', id: 'body'}],
            },
          ],
        },
        scene(feature()),
        []
      )
    ).toThrow('procedural');
  });

  it('teaches reusable environment recipes and selective atmosphere refinements', () => {
    const prompt = buildScenePrompt({
      prompt: 'Create a moonlit Japanese garden',
      scene: scene(feature()),
      selectedId: 'pond',
      catalog: [],
    });
    for (const term of [
      'environment',
      'sunrise',
      'landscape',
      'bankWidth',
      'seed',
      'planting',
      'exclusion masks',
    ]) {
      expect(prompt).toContain(term);
    }
    expect(prompt).toContain(JSON.stringify(environment()));
  });
});
