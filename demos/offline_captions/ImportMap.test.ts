import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe, expect, it} from 'vitest';

import {
  ASSETS,
  MODEL_BASE,
  ORT_BASE,
  REVISION,
  RUNTIME_URL,
  TOTAL_BYTES,
} from './modelConfig.js';

const read = (path: string) =>
  readFileSync(resolve(import.meta.dirname, path), 'utf8');
const page = new DOMParser().parseFromString(read('index.html'), 'text/html');
const {imports} = JSON.parse(
  page.querySelector('script[type="importmap"]')!.textContent!
) as {imports: Record<string, string>};
const {peerDependencies} = JSON.parse(read('../../package.json'));

describe('offline captions browser entry', () => {
  it('aligns all three.js import paths with the SDK peer requirement', () => {
    expect(peerDependencies.three).toBe('^0.186.0');
    const base = `https://cdn.jsdelivr.net/npm/three@${peerDependencies.three.slice(1)}/`;
    expect(imports.three).toBe(`${base}build/three.module.js`);
    expect(imports['three/']).toBe(base);
    expect(imports['three/addons/']).toBe(`${base}examples/jsm/`);
    expect(imports.xrblocks).toBe('../../build/xrblocks.js');
  });

  it('uses the existing UIKit pins', () => {
    for (const name of ['uikit', 'uikit-pub-sub', 'msdfonts']) {
      expect(imports[`@pmndrs/${name}`]).toBe(
        `https://cdn.jsdelivr.net/npm/@pmndrs/${name}@1.0.64/dist/index.min.js`
      );
    }
    expect(imports['@preact/signals-core']).toBe(
      'https://cdn.jsdelivr.net/npm/@preact/signals-core@1.14.0/dist/signals-core.mjs'
    );
  });

  it('pins the standalone worker runtime, ORT files and model revision', () => {
    expect(RUNTIME_URL).toBe(
      'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0/dist/transformers.min.js'
    );
    expect(Object.values(imports)).not.toContain(RUNTIME_URL);
    expect(REVISION).toMatch(/^[a-f0-9]{40}$/);
    expect(MODEL_BASE).toBe(
      `https://huggingface.co/onnx-community/moonshine-base-ONNX/resolve/${REVISION}/`
    );
    expect(ORT_BASE).toMatch(
      /^https:\/\/cdn\.jsdelivr\.net\/npm\/onnxruntime-web@1\.31\.0-dev\.[\w.-]+\/dist\/$/
    );
    const urls = ASSETS.map(({url}) => url);
    expect(urls).toContain(`${ORT_BASE}ort-wasm-simd-threaded.asyncify.wasm`);
    expect(urls).toContain(`${ORT_BASE}ort-wasm-simd-threaded.asyncify.mjs`);
    for (const url of urls) {
      expect(url.startsWith(MODEL_BASE) || url.startsWith(ORT_BASE)).toBe(true);
    }
    const worker = read('captionsWorker.js');
    expect(worker).toContain("from './modelConfig.js'");
    expect(worker).toContain('import(RUNTIME_URL)');
    expect(worker).not.toContain('transformers.web.min.js');
    const client = read('CaptionsClient.js');
    expect(client).toContain("new URL('./captionsWorker.js', import.meta.url)");
    expect(client).toContain("type: 'module'");
  });

  it('keeps landing copy short: task, download size, browser and privacy', () => {
    const panel = page.getElementById('model-preload')!;
    const copy = panel.textContent!.replace(/\s+/g, ' ');
    expect(page.title).toContain('Offline captions');
    expect(copy).toContain(`~${Math.round(TOTAL_BYTES / 1e6)} MB`);
    expect(copy).toMatch(/Chrome/);
    expect(copy).toMatch(/microphone/);
    expect(copy).toContain('Audio stays on this device. No cloud, no API key.');
    expect(copy).not.toMatch(/may |pause|incorrect|warning|safety/i);
    expect(page.querySelector('#preload-load')?.hasAttribute('disabled')).toBe(
      true
    );
    expect(
      page.querySelector('script[src="./main.js"]')?.getAttribute('type')
    ).toBe('module');
  });

  it('stays self-contained and never uses the cloud speech recognizer', () => {
    for (const file of [
      'index.html',
      'main.js',
      'preload.js',
      'CaptionsDemo.js',
      'captionsWorker.js',
      'microphone.js',
    ]) {
      expect(read(file)).not.toMatch(
        /gemma_vision|gemma_on_device|SpeechRecognizer|webkitSpeechRecognition|api[-_ ]?key=/i
      );
    }
    expect(Object.keys(imports)).not.toContain('xrblocks/addons/');
  });
});
