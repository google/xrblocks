const MIN_REPEATED_CHARS = 24;
const LONG_UNIT_CHARS = 32;
const MAX_UNIT_CHARS = 200;

/**
 * Detect an answer that has started repeating itself: a span of at least 32
 * characters seen twice in a row, or a shorter span seen three times, at the
 * end of the text. Spans without letters or digits never count.
 * @param {string} text Streamed answer so far.
 * @returns {number} Index just after the first copy of the repeated span, or
 *     -1 when the text does not end in a repetition.
 */
export function findRepetition(text) {
  for (let size = 4; size <= MAX_UNIT_CHARS; size++) {
    const copies = size >= LONG_UNIT_CHARS ? 2 : 3;
    if (size * copies < MIN_REPEATED_CHARS || size * copies > text.length) {
      continue;
    }
    const unit = text.slice(-size);
    if (!/[\p{L}\p{N}]/u.test(unit) || !text.endsWith(unit.repeat(copies))) {
      continue;
    }
    let start = text.length - size * copies;
    while (start >= size && text.slice(start - size, start) === unit) {
      start -= size;
    }
    return start + size;
  }
  return -1;
}
