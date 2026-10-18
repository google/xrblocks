import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'package.json')));

// Outside the repository: neither its paths aliases nor its node_modules may
// satisfy missing declarations in the published bundle.
const consumer = fs.mkdtempSync(path.join(os.tmpdir(), 'xrblocks-types-'));
try {
  fs.cpSync(path.join(root, 'tools/fixtures/types-consumer'), consumer, {
    recursive: true,
  });
  const fixture = JSON.parse(
    fs.readFileSync(path.join(consumer, 'package.json'))
  );
  fs.writeFileSync(
    path.join(consumer, 'package.json'),
    JSON.stringify({
      ...fixture,
      // Include optional peers for strict declaration checking. Never let the
      // repository's devDependencies hide an undeclared consumer dependency.
      dependencies: {...manifest.dependencies, ...manifest.peerDependencies},
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
  fs.mkdirSync(sdk, {recursive: true});
  fs.writeFileSync(path.join(sdk, 'package.json'), JSON.stringify(manifest));
  fs.cpSync(path.join(root, 'build'), path.join(sdk, 'build'), {
    recursive: true,
  });
  // Every emitted addon declaration is reachable through the package wildcard.
  const addons = fs
    .readdirSync(path.join(sdk, 'build/addons'), {recursive: true})
    .filter((file) => file.endsWith('.d.ts'))
    .sort();
  fs.writeFileSync(
    path.join(consumer, 'addons.ts'),
    addons
      .map(
        (file, index) =>
          `export * as addon${index} from 'xrblocks/addons/${file.replaceAll(path.sep, '/').replace(/\.d\.ts$/, '.js')}';`
      )
      .join('\n')
  );

  const compilers = [
    ['repository', path.join(root, 'node_modules/typescript/bin/tsc')],
    [
      'latest stable',
      path.join(consumer, 'node_modules/typescript-stable/bin/tsc'),
    ],
    ['5.9', path.join(consumer, 'node_modules/typescript-5-9/bin/tsc')],
  ];
  let failures = 0;
  for (const [label, compiler] of compilers) {
    console.log(
      `Checking root and ${addons.length} addon declarations with TypeScript ${label}:`
    );
    const version = execFileSync(process.execPath, [compiler, '--version'], {
      encoding: 'utf8',
    }).trim();
    console.log(version);
    // LiteRT exposes WebGPU objects. TS 5.x requires the optional WebGPU
    // declarations; TS 6+ supplies them in lib.dom (loading both conflicts).
    const extraTypes = version.startsWith('Version 5.')
      ? ['--types', '@webgpu/types']
      : [];
    try {
      execFileSync(
        process.execPath,
        [compiler, '-p', consumer, ...extraTypes],
        {
          cwd: consumer,
          stdio: 'inherit',
        }
      );
    } catch {
      failures++;
    }
    console.log('Checking the legacy SIMD 0.17.3 consumer assignment:');
    try {
      execFileSync(
        process.execPath,
        [compiler, '-p', path.join(consumer, 'tsconfig.legacy.json')],
        {cwd: consumer, stdio: 'inherit'}
      );
    } catch {
      failures++;
    }
  }
  if (failures) {
    console.error(`Consumer declarations failed in ${failures} check(s).`);
    process.exitCode = 1;
  } else {
    console.log(
      'Verified published declarations with Bundler resolution and skipLibCheck: false.'
    );
  }
} finally {
  fs.rmSync(consumer, {recursive: true, force: true});
}
