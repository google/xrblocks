import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {describe, expect, it} from 'vitest';

describe('Gemma demo import map', () => {
  function imports() {
    const page = new DOMParser().parseFromString(
      readFileSync(resolve(import.meta.dirname, 'index.html'), 'utf8'),
      'text/html'
    );
    return JSON.parse(
      page.querySelector('script[type="importmap"]')!.textContent!
    ).imports as Record<string, string>;
  }

  it('uses the SDK peer version for every three mapping', () => {
    const {peerDependencies} = JSON.parse(
      readFileSync(resolve(import.meta.dirname, '../../package.json'), 'utf8')
    );
    const version = peerDependencies.three.replace(/^\^/, '');
    const base = `https://cdn.jsdelivr.net/npm/three@${version}/`;
    expect(imports()).toMatchObject({
      three: `${base}build/three.module.js`,
      'three/': base,
      'three/addons/': `${base}examples/jsm/`,
      xrblocks: '../../build/xrblocks.js',
      'xrblocks/addons/': '../../build/addons/',
    });
  });

  it('keeps the inference runtime out of the document import map and startup', () => {
    expect(imports()).not.toHaveProperty('@litert-lm/core');
    expect(imports()).not.toHaveProperty('@litertjs/wasm-utils');
    expect(Object.keys(imports())).not.toContain('@mediapipe/tasks-genai');
    const main = readFileSync(resolve(import.meta.dirname, 'main.js'), 'utf8');
    expect(main).toContain('new GemmaScene()');
    expect(main).not.toMatch(/loadRuntime|@litert/);
  });

  it('pins the Markdown lexer to the same exact version used by tests', () => {
    const {devDependencies} = JSON.parse(
      readFileSync(resolve(import.meta.dirname, '../../package.json'), 'utf8')
    );
    expect(devDependencies.marked).toBe('14.1.4');
    expect(imports().marked).toBe(
      `https://esm.sh/marked@${devDependencies.marked}`
    );
  });

  it('pins the worker bundle and matching WASM without a document import map', () => {
    const worker = readFileSync(
      resolve(import.meta.dirname, 'gemmaWorker.js'),
      'utf8'
    );
    const runtimeUrl = worker.match(/const RUNTIME_URL\s*=\s*'([^']+)'/)?.[1];
    const wasmUrl = worker.match(/const WASM_URL\s*=\s*'([^']+)'/)?.[1];
    expect(runtimeUrl).toBe(
      'https://esm.sh/@litert-lm/core@0.17.1?deps=@litertjs/wasm-utils@2.0.0&bundle'
    );
    expect(wasmUrl).toBe(
      'https://cdn.jsdelivr.net/npm/@litert-lm/core@0.17.1/wasm/'
    );
    expect(worker).toContain('import(RUNTIME_URL)');
  });
});
