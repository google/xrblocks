import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json')));
const lock = JSON.parse(fs.readFileSync(path.join(root, 'package-lock.json')));

// Only consumer peers, optional providers, and Three.js types. In particular,
// do not install the SDK's devDependencies or ambient speech declarations.
const packages = [
  'three',
  '@types/three',
  '@dimforge/rapier3d',
  '@google/genai',
  'openai',
  'lit',
  '@pmndrs/uikit',
  '@preact/signals-core',
  '@mediapipe/tasks-vision',
  '@mediapipe/tasks-audio',
  '@sparkjsdev/spark',
  'three-mesh-bvh',
];

// Outside the repository: neither its paths aliases nor its node_modules may
// satisfy missing declarations in the published bundle.
const consumer = fs.mkdtempSync(path.join(os.tmpdir(), 'xrblocks-types-'));
try {
  fs.cpSync(path.join(root, 'tools/fixtures/types-consumer'), consumer, {
    recursive: true,
  });
  fs.writeFileSync(
    path.join(consumer, 'package.json'),
    JSON.stringify({
      private: true,
      type: 'module',
      dependencies: Object.fromEntries(
        packages.map((name) => [
          name,
          lock.packages[`node_modules/${name}`].version,
        ])
      ),
    })
  );
  execFileSync(
    'npm',
    [
      'install',
      '--ignore-scripts',
      '--no-package-lock',
      '--no-audit',
      '--no-fund',
    ],
    {cwd: consumer, stdio: 'inherit'}
  );

  const sdk = path.join(consumer, 'node_modules/xrblocks');
  fs.mkdirSync(path.join(sdk, 'build'), {recursive: true});
  fs.writeFileSync(path.join(sdk, 'package.json'), JSON.stringify(manifest));
  fs.copyFileSync(
    path.join(root, 'build/xrblocks.d.ts'),
    path.join(sdk, 'build/xrblocks.d.ts')
  );
  execFileSync(path.join(root, 'node_modules/.bin/tsc'), ['-p', consumer], {
    cwd: consumer,
    stdio: 'inherit',
  });
  console.log('Verified published declarations with skipLibCheck: false.');
} finally {
  fs.rmSync(consumer, {recursive: true, force: true});
}
