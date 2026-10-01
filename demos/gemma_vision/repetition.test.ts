import {describe, expect, it} from 'vitest';

import {findRepetition} from './repetition.js';

const cut = (text: string) => {
  const index = findRepetition(text);
  return index < 0 ? null : text.slice(0, index).trimEnd();
};

describe('findRepetition', () => {
  it('stops a long sentence once it starts over', () => {
    const sentence =
      'The golden book of the year 934 is a gold record of the year 934. ';
    expect(cut(sentence + sentence)).toBe(sentence.trimEnd());
    expect(cut(sentence + sentence.slice(0, 20))).toBeNull();
  });

  it('stops short spans after three copies', () => {
    const unit = '3 4 5 6 7 8 9 1 2 ';
    expect(cut('9 ' + unit + unit)).toBeNull();
    expect(cut('9 ' + unit + unit + unit)).toBe('9 3 4 5 6 7 8 9 1 2');
    expect(cut('The text reads: "' + 'The text reads: "'.repeat(3))).toBe(
      'The text reads: "'
    );
  });

  it('leaves normal answers, short emphasis and punctuation alone', () => {
    for (const text of [
      'The text written in this image is "PLEASE KEEP THIS DOOR CLOSED".',
      'STOP STOP STOP',
      'Wait...... ok!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!',
      'ORGANIC GREEN TEA and 20 TEA BAGS',
      '',
    ]) {
      expect(findRepetition(text)).toBe(-1);
    }
  });
});
