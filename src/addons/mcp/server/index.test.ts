// @vitest-environment node
import {expect, it} from 'vitest';
import {indexSymbols} from './index.js';

it('indexes public APIs without exposing private members or internal classes', () => {
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
  expect(symbols.map(({name, owner}) => ({name, owner}))).toEqual([
    {name: 'Options', owner: null},
    {name: 'enableDepth', owner: 'Options'},
  ]);
});
