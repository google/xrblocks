import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {expect, it} from 'vitest';

it('pins every three import-map entry to the SDK peer requirement', () => {
  const page = new DOMParser().parseFromString(
    readFileSync(resolve(import.meta.dirname, 'index.html'), 'utf8'),
    'text/html'
  );
  const importMap = page.querySelector('script[type="importmap"]');
  expect(importMap).not.toBeNull();
  const {imports} = JSON.parse(importMap?.textContent ?? '{}') as {
    imports: Record<string, string>;
  };
  const {peerDependencies} = JSON.parse(
    readFileSync(resolve(import.meta.dirname, '../../package.json'), 'utf8')
  ) as {peerDependencies: {three: string}};
  const version = peerDependencies.three.replace(/^\^/, '');
  const base = `https://cdn.jsdelivr.net/npm/three@${version}/`;

  expect(imports.three).toBe(`${base}build/three.module.js`);
  expect(imports['three/addons/']).toBe(`${base}examples/jsm/`);
  expect(imports['three/']).toBe(base);
});
