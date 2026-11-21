import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe, expect, it} from 'vitest';

import {MEDIAPIPE_WASM_URL, MODEL_URL} from './SegmenterClient.js';

const read = (path: string) =>
  readFileSync(resolve(import.meta.dirname, path), 'utf8');
const page = new DOMParser().parseFromString(read('index.html'), 'text/html');
const {imports} = JSON.parse(
  page.querySelector('script[type="importmap"]')!.textContent!
) as {imports: Record<string, string>};
const {devDependencies, peerDependencies} = JSON.parse(
  read('../../package.json')
) as {
  devDependencies: Record<string, string>;
  peerDependencies: Record<string, string>;
};

describe('magic cutout browser entry', () => {
  it('aligns all three.js, UIKit, and MediaPipe import paths with SDK pins', () => {
    expect(peerDependencies.three).toBe('^0.186.0');
    const threeBase = `https://cdn.jsdelivr.net/npm/three@${peerDependencies.three.slice(1)}/`;
    expect(imports.three).toBe(`${threeBase}build/three.module.js`);
    expect(imports['three/']).toBe(threeBase);
    expect(imports['three/addons/']).toBe(`${threeBase}examples/jsm/`);
    expect(imports.xrblocks).toBe('../../build/xrblocks.js');
    expect(imports['xrblocks/addons/']).toBe('../../build/addons/');

    for (const name of ['uikit', 'uikit-pub-sub', 'msdfonts']) {
      expect(imports[`@pmndrs/${name}`]).toBe(
        `https://cdn.jsdelivr.net/npm/@pmndrs/${name}@1.0.77/dist/index.min.js`
      );
    }
    expect(imports['@preact/signals-core']).toBe(
      'https://cdn.jsdelivr.net/npm/@preact/signals-core@1.14.0/dist/signals-core.mjs'
    );

    const mpVersion = devDependencies['@mediapipe/tasks-vision'].replace(
      /^[\^~]/,
      ''
    );
    expect(imports['@mediapipe/tasks-vision']).toBe(
      `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${mpVersion}/vision_bundle.mjs`
    );
    expect(MEDIAPIPE_WASM_URL).toBe(
      `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${mpVersion}/wasm`
    );
    expect(MODEL_URL).toMatch(
      /^https:\/\/storage\.googleapis\.com\/mediapipe-models\/.*\.tflite$/
    );
  });

  it('keeps the demo self-contained without API keys or cloud backends', () => {
    expect(page.title).toContain('Magic Cutout');
    expect(
      page.querySelector('script[src="./main.js"]')?.getAttribute('type')
    ).toBe('module');

    for (const file of [
      'index.html',
      'main.js',
      'MagicCutoutDemo.js',
      'SegmenterClient.js',
      'cutout.js',
    ]) {
      expect(read(file)).not.toMatch(/api[-_ ]?key=|generativelanguage/i);
    }
  });
});
