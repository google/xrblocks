import {describe, expect, it} from 'vitest';

import {applyScenePlan, assertPlanFresh, readSceneLayout} from './ScenePlan';
import {
  MAX_SCENE_SCATTER_COUNT,
  type SceneEnvironment,
  type SceneLandscape,
  type SceneLandscapeObject,
  type SceneLayout,
  type SceneObject,
  type ScenePond,
  type SceneScatter,
} from './SceneTypes';

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
  it('round-trips a complete virtual setting with landscape geometry', () => {
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
      feature(planting(), {id: 'trees'})
    );
    expect(readSceneLayout(JSON.stringify(input), [])).toEqual(input);
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
});
