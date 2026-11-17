import {expect, it} from 'vitest';
import {parseSimulatorSceneManifest} from './SimulatorEnvironmentManifest';

it('resolves scene resources relative to the manifest and preserves absolute URLs', () => {
  const manifest = parseSimulatorSceneManifest(
    {
      scenePath: 'day.glb',
      scenePlanesPath: '../planes.json',
      lighting: {
        kind: 'dayNight',
        nightScenePath: 'https://assets.example.com/night.glb',
        pairing: 'bake-crossfade-v1',
      },
    },
    'https://example.com/envs/loft/manifest.json'
  );
  expect(manifest.scenePath).toBe('https://example.com/envs/loft/day.glb');
  expect(manifest.scenePlanesPath).toBe('https://example.com/envs/planes.json');
  expect(manifest.lighting?.nightScenePath).toBe(
    'https://assets.example.com/night.glb'
  );
});

it('rejects lighting without a usable night scene', () => {
  expect(() =>
    parseSimulatorSceneManifest(
      {lighting: {kind: 'dayNight', pairing: 'bake-crossfade-v1'}},
      'https://example.com/manifest.json'
    )
  ).toThrow(/nightScenePath/);
});
