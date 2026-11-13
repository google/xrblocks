import {describe, expect, it} from 'vitest';
import {callTool, indexSymbols, loadSymbols} from './index.js';

it('indexes public members while excluding private and invented APIs', () => {
  const symbols = indexSymbols(`
declare class Options {
    enableDepth(): this;
    private cache: unknown;
    protected reset(): void;
}
declare class InternalHelper {
    leak(): void;
}
export {Options};
  `);
  expect(symbols.find((symbol) => symbol.name === 'enableDepth')).toMatchObject(
    {owner: 'Options', kind: 'member'}
  );
  for (const name of [
    'cache',
    'reset',
    'InternalHelper',
    'leak',
    'createXRScene',
  ])
    expect(symbols.some((symbol) => symbol.name === name)).toBe(false);
});

describe('generated API search', () => {
  it('finds a real public API and rejects a fabricated one', () => {
    expect(
      loadSymbols().find((symbol) => symbol.name === 'enableDepth')?.owner
    ).toBe('Options');
    expect(callTool('search_api', {query: 'createXRScene'}).text).toContain(
      'No XR Blocks API matches'
    );
  }, 30000);
});

it('returns the requested consumer skill content', () => {
  const result = callTool('get_skill', {name: 'xb-build-app'});
  expect(result.isError).toBeFalsy();
  expect(result.text).toContain('name: xb-build-app');
});
