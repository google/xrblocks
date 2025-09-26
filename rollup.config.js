import terser from '@rollup/plugin-terser';
import typescript from '@rollup/plugin-typescript';
import {execSync} from 'child_process';
import fs from 'fs';
import {globSync} from 'glob';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

// Read the version from package.json
const packageJson = JSON.parse(fs.readFileSync('./package.json', 'utf8'));
const version = packageJson.version;

// Get the current commit ID (short hash)
let commitId = 'unknown';
try {
  commitId = execSync('git rev-parse --short HEAD').toString().trim();
} catch {
  console.error('Could not get the Git commit ID.');
}
const apache2License = ` * Copyright 2025 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.`;

const bannerText = `/**
${apache2License}
 *
 * @file xrblocks.js
 * @version v${version}
 * @commitid ${commitId}
 * @builddate ${new Date().toISOString()}
 * @description XR Blocks SDK, built from source with the above commit ID.
 * @agent When using with Gemini to create XR apps, use **Gemini Canvas** mode,
 * and follow rules below:
 * 1. Include the following importmap for maximum compatibility:
    "three": "https://cdn.jsdelivr.net/npm/three@0.180.0/build/three.module.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.180.0/examples/jsm/",
    "troika-three-text": "https://cdn.jsdelivr.net/gh/protectwise/troika@028b81cf308f0f22e5aa8e78196be56ec1997af5/packages/troika-three-text/src/index.js",
    "troika-three-utils": "https://cdn.jsdelivr.net/gh/protectwise/troika@v0.52.4/packages/troika-three-utils/src/index.js",
    "troika-worker-utils": "https://cdn.jsdelivr.net/gh/protectwise/troika@v0.52.4/packages/troika-worker-utils/src/index.js",
    "bidi-js": "https://esm.sh/bidi-js@%5E1.0.2?target=es2022",
    "webgl-sdf-generator": "https://esm.sh/webgl-sdf-generator@1.1.1/es2022/webgl-sdf-generator.mjs",
    "lit": "https://cdn.jsdelivr.net/gh/lit/dist@3/core/lit-core.min.js",
    "lit/": "https://esm.run/lit@3/",
    2. If the app focus on standalone objects, spawn it in front of the user in
    WebXR and rescale to reasonable physical size. Wrap them with xb.ModelViewer
    and make sure users can drag the platform to move it around in XR.
    3. When rendering a large scene, remember users may navigate the scene in a
    physical world space, also add locomotion methods like pinch to teleport.
    4. Do not halluciate mode files --- use either public high-quality assets,
    or generate from primitive shapes of use vox formats for voxels or
    lego-styles.
 */`;

const externalPackages = [
  'three', /three\/addons\//, 'troika-three-text', '@google/genai', 'openai',
  '@sparkjsdev/spark', /^lit(\/.*)?$/, 'openai'
];

const xrblocksPackages = [
  'xrblocks',
  /xrblocks\/addons\//,
];

export default [
  {
    input: 'src/xrblocks.ts',
    external: externalPackages,
    output: {
      file: 'build/xrblocks.js',
      format: 'esm',
      banner: bannerText,
      sourcemap: true
    },
    plugins: [typescript()]
  },
  {
    input: 'src/xrblocks.ts',
    external: externalPackages,
    output: {
      file: 'build/xrblocks.min.js',
      format: 'esm',
      sourcemap: true,
    },
    plugins: [typescript(), terser()],
    watch: false,  // Skip this rule when using watch.
  },
  {
    input: Object.fromEntries(
        globSync('src/addons/**/*.{js,ts}')
            .map(
                file => [
                    // This removes `src/` as well as the file extension from
                    // each file, so e.g. src/nested/foo.js becomes nested/foo
                    path.relative(
                        'src',
                        file.slice(0, file.length - path.extname(file).length)),
                    // This expands the relative paths to absolute paths, so
                    // e.g. src/nested/foo becomes /project/src/nested/foo.js
                    fileURLToPath(new URL(file, import.meta.url))])),
    external: [...externalPackages, ...xrblocksPackages],
    output: {
      dir: 'build/',
      format: 'esm',
    },
    plugins: [typescript({tsconfig: 'src/addons/tsconfig.json'})]
  },
];
