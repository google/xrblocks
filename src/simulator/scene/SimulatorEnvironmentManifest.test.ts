import {describe, expect, it} from 'vitest';

import {parseSimulatorSceneManifest} from './SimulatorEnvironmentManifest';

const MANIFEST_URL = 'https://example.com/envs/loft/manifest.json';

function parseLighting(lighting: unknown) {
  return parseSimulatorSceneManifest({lighting}, MANIFEST_URL).lighting;
}

describe('SimulatorDayNightLightingDefinition parse', () => {
  it('accepts a dayNight bake pair and resolves the night scene URL', () => {
    const lighting = parseLighting({
      kind: 'dayNight',
      nightScenePath: 'night.glb',
      pairing: 'bake-crossfade-v1',
    });
    expect(lighting).toEqual({
      kind: 'dayNight',
      nightScenePath: 'https://example.com/envs/loft/night.glb',
      pairing: 'bake-crossfade-v1',
    });
  });

  it('keeps absolute night scene URLs', () => {
    const lighting = parseLighting({
      kind: 'dayNight',
      nightScenePath: 'https://assets.example.com/night.glb',
      pairing: 'bake-crossfade-v1',
    });
    expect(lighting?.nightScenePath).toBe(
      'https://assets.example.com/night.glb'
    );
  });

  it('defaults to no lighting block', () => {
    const manifest = parseSimulatorSceneManifest(
      {scenePath: 'day.glb'},
      MANIFEST_URL
    );
    expect(manifest.lighting).toBeUndefined();
  });

  it('rejects non-object lighting blocks', () => {
    expect(() => parseLighting('dayNight')).toThrow(
      'manifest.lighting: expected an object.'
    );
  });

  it('rejects unknown fields', () => {
    expect(() =>
      parseLighting({
        kind: 'dayNight',
        nightScenePath: 'night.glb',
        pairing: 'bake-crossfade-v1',
        moonScenePath: 'moon.glb',
      })
    ).toThrow("manifest.lighting: unknown field 'moonScenePath'.");
  });

  it('rejects unknown lighting kinds', () => {
    expect(() =>
      parseLighting({
        kind: 'goldenHour',
        nightScenePath: 'night.glb',
        pairing: 'bake-crossfade-v1',
      })
    ).toThrow("manifest.lighting.kind: expected 'dayNight'.");
  });

  it('rejects unknown pairing versions', () => {
    expect(() =>
      parseLighting({
        kind: 'dayNight',
        nightScenePath: 'night.glb',
        pairing: 'bake-crossfade-v2',
      })
    ).toThrow("manifest.lighting.pairing: expected 'bake-crossfade-v1'.");
  });

  it('requires a night scene path', () => {
    expect(() =>
      parseLighting({kind: 'dayNight', pairing: 'bake-crossfade-v1'})
    ).toThrow('manifest.lighting: nightScenePath is required.');
    expect(() =>
      parseLighting({
        kind: 'dayNight',
        nightScenePath: '',
        pairing: 'bake-crossfade-v1',
      })
    ).toThrow('manifest.lighting.nightScenePath: expected a non-empty string.');
  });
});
