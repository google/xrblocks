import {describe, expect, it} from 'vitest';
import {validMessage} from './protocol';

describe('Companion message bounds', () => {
  it.each([
    {type: 'move', x: NaN, y: 0},
    {type: 'motion', state: {sample: 1, x: Infinity, y: 0, scroll: 0, zoom: 0}},
    {type: 'button', down: 'yes'},
    {type: 'edit', revision: 1, value: 'a', start: 1, end: 0},
    {type: 'edit', revision: 1, value: 'x'.repeat(16001), start: 0, end: 0},
    {
      type: 'text',
      state: {
        revision: 1,
        value: 'a',
        start: 0,
        end: 0,
        label: 'x',
        multiline: true,
        maxLength: -1,
      },
    },
  ])('rejects malformed or oversized messages', (message) =>
    expect(validMessage(message)).toBe(false)
  );
});
