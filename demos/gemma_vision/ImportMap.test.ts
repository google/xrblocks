import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe, expect, it} from 'vitest';

import {MODEL_BASE, REVISION, RUNTIME_URL} from './modelConfig.js';

const read = (path: string) =>
  readFileSync(resolve(import.meta.dirname, path), 'utf8');
const page = new DOMParser().parseFromString(read('index.html'), 'text/html');
const {imports} = JSON.parse(
  page.querySelector('script[type="importmap"]')!.textContent!
) as {imports: Record<string, string>};
const {peerDependencies, devDependencies} = JSON.parse(
  read('../../package.json')
);

describe('Gemma vision browser entry', () => {
  it('aligns all three.js import paths with the SDK peer requirement', () => {
    expect(peerDependencies.three).toBe('^0.186.0');
    const base = `https://cdn.jsdelivr.net/npm/three@${peerDependencies.three.slice(1)}/`;
    expect(imports.three).toBe(`${base}build/three.module.js`);
    expect(imports['three/']).toBe(base);
    expect(imports['three/addons/']).toBe(`${base}examples/jsm/`);
    expect(imports.xrblocks).toBe('../../build/xrblocks.js');
  });

  it('uses existing UIKit pins and the exact installed marked version', () => {
    expect(devDependencies.marked).toBe('14.1.4');
    expect(imports.marked).toBe('https://esm.sh/marked@14.1.4');
    for (const name of ['uikit', 'uikit-pub-sub', 'msdfonts']) {
      expect(imports[`@pmndrs/${name}`]).toBe(
        `https://cdn.jsdelivr.net/npm/@pmndrs/${name}@1.0.64/dist/index.min.js`
      );
    }
    expect(imports['@preact/signals-core']).toBe(
      'https://cdn.jsdelivr.net/npm/@preact/signals-core@1.14.0/dist/signals-core.mjs'
    );
  });

  it('pins the standalone worker runtime and model revision without a web bundle', () => {
    expect(RUNTIME_URL).toBe(
      'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0/dist/transformers.min.js'
    );
    expect(imports['@huggingface/transformers']).toBe(RUNTIME_URL);
    expect(REVISION).toMatch(/^[a-f0-9]{40}$/);
    expect(MODEL_BASE).toContain(`/resolve/${REVISION}/`);
    expect(MODEL_BASE).not.toMatch(/\/(main|latest)\//);
    const worker = read('gemmaVisionWorker.js');
    expect(worker).toContain("from './modelConfig.js'");
    expect(worker).toContain('import(RUNTIME_URL)');
    const client = read('GemmaVisionClient.js');
    expect(client).toContain(
      "new URL('./gemmaVisionWorker.js', import.meta.url)"
    );
    expect(client).toContain("type: 'module'");
    expect(worker).not.toContain('transformers.web.min.js');
  });

  it('keeps landing copy focused on the task, download, desktop requirements and privacy', () => {
    const panel = page.getElementById('model-preload')!;
    const copy = panel.textContent!.replace(/\s+/g, ' ');
    expect(page.title).toContain('What am I looking at?');
    expect(copy).toContain('~3.4 GB');
    expect(copy).toContain('~360 MB');
    expect(copy).toMatch(/Chrome with WebGPU/);
    expect(copy).toMatch(/describe it or read its text/i);
    expect(copy).toMatch(/Gemma 4 also translates/i);
    expect(copy).not.toMatch(/shader|compil|pause|safety-critical|unverified/i);
    expect(copy).toMatch(
      /Initial app\/runtime\/model downloads use the network/
    );
    expect(copy).toMatch(
      /Camera images, questions, and answers stay on this device/
    );
    expect(copy).toMatch(
      /Offline questions work while the model remains loaded/
    );
    expect(page.querySelector('#preload-load')?.hasAttribute('disabled')).toBe(
      true
    );
    expect(
      page.querySelector('script[src="./main.js"]')?.getAttribute('type')
    ).toBe('module');
  });

  it('does not depend on LiteRT, keyboard addons or the other Gemma demo', () => {
    const files = [
      'index.html',
      'main.js',
      'preload.js',
      'gemmaVisionWorker.js',
    ];
    for (const file of files) {
      expect(read(file)).not.toMatch(
        /gemma_on_device|litert|addons\/keyboard/i
      );
    }
    expect(Object.keys(imports)).not.toContain('xrblocks/addons/');
  });
});
