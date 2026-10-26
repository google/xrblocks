import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {afterEach, describe, expect, it} from 'vitest';
import {
  checkBundleStaticImports,
  extractStaticImports,
  isAllowedExternalSpecifier,
} from './check-bundle-imports.js';

describe('check-bundle-imports', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs.splice(0)) {
      fs.rmSync(dir, {recursive: true, force: true});
    }
  });

  it('extracts static imports and exports across banner comments and minified statements while ignoring dynamic imports', () => {
    const source = `/**
 * "@pmndrs/uikit": "https://cdn.jsdelivr.net/npm/@pmndrs/uikit/dist/index.min.js"
 */
import { a as b } from "./internal/chunkA.js";
import*as THREE from"three";import{GLTFLoader as e}from"three/addons/loaders/GLTFLoader.js";
import "./internal/sideEffect.js";
export { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
const loadUI = () => import("./internal/UIKitBackend.js");
`;
    expect(extractStaticImports(source)).toEqual([
      './internal/chunkA.js',
      'three',
      'three/addons/loaders/GLTFLoader.js',
      './internal/sideEffect.js',
      'three/addons/loaders/GLTFLoader.js',
    ]);
  });

  it('allows only three and three/addons/* by default', () => {
    expect(isAllowedExternalSpecifier('three')).toBe(true);
    expect(
      isAllowedExternalSpecifier('three/addons/loaders/GLTFLoader.js')
    ).toBe(true);
    expect(isAllowedExternalSpecifier('@pmndrs/uikit')).toBe(false);
    expect(isAllowedExternalSpecifier('three/webgpu')).toBe(false);
    expect(isAllowedExternalSpecifier('three/tsl')).toBe(false);
    expect(isAllowedExternalSpecifier('lit')).toBe(false);
  });

  it('reports transitive disallowed static imports with their full import chain', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'xrblocks-imports-'));
    tempDirs.push(tmpDir);

    fs.mkdirSync(path.join(tmpDir, 'build', 'internal'), {recursive: true});
    fs.writeFileSync(
      path.join(tmpDir, 'build', 'xrblocks.js'),
      `import { x } from "./internal/PanelMaterialFactory.js";\nimport * as THREE from "three";\n`
    );
    fs.writeFileSync(
      path.join(tmpDir, 'build', 'internal', 'PanelMaterialFactory.js'),
      `/* banner */\nimport * as THREE from "three";\nimport { Custom } from "@pmndrs/uikit";\nexport const x = 1;\n`
    );

    const result = checkBundleStaticImports({
      rootDir: tmpDir,
      entryFiles: ['build/xrblocks.js'],
    });

    expect(result.checkedFiles).toEqual([
      'build/xrblocks.js',
      'build/internal/PanelMaterialFactory.js',
    ]);
    expect(result.violations).toEqual([
      {
        specifier: '@pmndrs/uikit',
        chain: [
          'build/xrblocks.js',
          'build/internal/PanelMaterialFactory.js',
          '@pmndrs/uikit',
        ],
      },
    ]);
  });
});
