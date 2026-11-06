import fs from 'node:fs';
import path from 'node:path';
import {describe, expect, it} from 'vitest';

const SAMPLES_DIR = path.resolve(import.meta.dirname, '../samples');

/**
 * Samples whose cards are labels rather than interactive panels, so an exit
 * button would not belong on them.
 */
const EXEMPT_SAMPLES = new Set([
  // Cards are floating portal name labels.
  'advanced/portals',
]);

function listSampleDirs(): string[] {
  const dirs: string[] = [];
  for (const category of fs.readdirSync(SAMPLES_DIR, {withFileTypes: true})) {
    if (!category.isDirectory()) continue;
    const categoryDir = path.join(SAMPLES_DIR, category.name);
    for (const sample of fs.readdirSync(categoryDir, {withFileTypes: true})) {
      if (sample.isDirectory()) dirs.push(`${category.name}/${sample.name}`);
    }
  }
  return dirs;
}

function readSources(dir: string): string {
  let text = '';
  for (const entry of fs.readdirSync(dir, {withFileTypes: true})) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      text += readSources(fullPath);
    } else if (/\.(js|ts|html)$/.test(entry.name)) {
      text += fs.readFileSync(fullPath, 'utf8');
    }
  }
  return text;
}

describe('samples', () => {
  it('give every sample with a spatial card a way to exit XR', () => {
    const missing = listSampleDirs().filter((sample) => {
      if (EXEMPT_SAMPLES.has(sample)) return false;
      const source = readSources(path.join(SAMPLES_DIR, sample));
      return (
        source.includes('new xb.UICard(') && !source.includes('UIExitButton')
      );
    });
    expect(missing).toEqual([]);
  });
});
