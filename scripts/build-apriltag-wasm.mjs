#!/usr/bin/env node

/**
 * Rebuild the self-contained tag25h9 detector from the official AprilTag C
 * reference implementation. The generated files are checked in so consumers
 * do not need Emscripten; this script is only for maintainers refreshing them.
 */

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import {fileURLToPath} from 'node:url';

const APRILTAG_REVISION = 'b7c0ebe9aa20f82ec7a828579004f9e706bfecd9';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDir = path.join(root, '.cache', 'apriltag');
const outputDir = path.join(root, 'src', 'addons', 'apriltags', 'wasm');
const gluePath = path.join(outputDir, 'apriltag_wasm.js');
const wrapper = path.join(
  root,
  'src',
  'addons',
  'apriltags',
  'native',
  'apriltag25h9.c'
);

function run(command, args) {
  execFileSync(command, args, {cwd: root, stdio: 'inherit'});
}

/**
 * Keep the typed-array views used by the worker available on the module. This
 * runs inside Emscripten's memory-view refresh function, so the properties
 * remain correct if ALLOW_MEMORY_GROWTH replaces the underlying buffer.
 */
function exposeHeapViews() {
  let glue = fs.readFileSync(gluePath, 'utf8');
  for (const [name, assignment] of [
    ['HEAPU8', 'HEAPU8=new Uint8Array(b)'],
    ['HEAPF64', 'HEAPF64=new Float64Array(b)'],
  ]) {
    const exported = `Module["${name}"]=${name}`;
    if (glue.includes(exported)) continue;
    if (!glue.includes(assignment)) {
      throw new Error(`Could not locate ${name} in generated Emscripten glue.`);
    }
    glue = glue.replace(assignment, `${assignment};${exported}`);
  }
  fs.writeFileSync(gluePath, glue);
}

if (process.argv.includes('--patch-only')) {
  exposeHeapViews();
  process.exit(0);
}

if (!fs.existsSync(sourceDir)) {
  fs.mkdirSync(path.dirname(sourceDir), {recursive: true});
  run('git', [
    'clone',
    '--no-checkout',
    'https://github.com/AprilRobotics/apriltag.git',
    sourceDir,
  ]);
}
run('git', [
  '-C',
  sourceDir,
  'fetch',
  '--depth',
  '1',
  'origin',
  APRILTAG_REVISION,
]);
run('git', ['-C', sourceDir, 'checkout', '--detach', APRILTAG_REVISION]);

const sourceFiles = [
  ...fs
    .readdirSync(sourceDir)
    .filter((file) => file.endsWith('.c') && file !== 'apriltag_pywrap.c')
    .map((file) => path.join(sourceDir, file)),
  ...fs
    .readdirSync(path.join(sourceDir, 'common'))
    .filter((file) => file.endsWith('.c'))
    .map((file) => path.join(sourceDir, 'common', file)),
  wrapper,
];

fs.mkdirSync(outputDir, {recursive: true});
run('emcc', [
  ...sourceFiles,
  '-I',
  sourceDir,
  '-I',
  path.join(sourceDir, 'common'),
  '-O3',
  '-sMODULARIZE=1',
  '-sEXPORT_ES6=1',
  '-sEXPORT_NAME=createAprilTagWasm',
  '-sENVIRONMENT=web,worker',
  '-sALLOW_MEMORY_GROWTH=1',
  '-sEXPORTED_FUNCTIONS=["_atag_init","_atag_destroy","_atag_set_image_size","_atag_set_quad_decimate","_atag_detect","_atag_result_stride","_atag_results_ptr"]',
  '-sEXPORTED_RUNTIME_METHODS=HEAPU8,HEAPF64',
  '-o',
  gluePath,
]);
exposeHeapViews();
