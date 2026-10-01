import {describe, expect, it} from 'vitest';

import {OCR_PROMPT, parseOcrResponse} from './ocr.js';

describe('parseOcrResponse', () => {
  it('reads a translated JSON reply, with or without a code fence', () => {
    const body =
      '{"language": "French", "text": "Bonjour le monde.", "english": "Hello world."}';
    for (const raw of [body, '```json\n' + body + '\n```']) {
      expect(parseOcrResponse(raw)).toEqual({
        language: 'French',
        text: 'Bonjour le monde.',
        english: 'Hello world.',
        translated: true,
      });
    }
  });

  it('does not count English pages as translated', () => {
    const result = parseOcrResponse(
      '{"language": "English", "text": "Hi.", "english": "Hi."}'
    );
    expect(result.translated).toBe(false);
    expect(result.english).toBe('Hi.');
    expect(parseOcrResponse('{"language": "en", "text": "Hi."}')).toMatchObject(
      {english: 'Hi.', translated: false}
    );
  });

  it('treats empty replies as no text', () => {
    const empty = {language: null, text: '', english: '', translated: false};
    expect(parseOcrResponse('')).toEqual(empty);
    expect(parseOcrResponse('NONE')).toEqual(empty);
    expect(
      parseOcrResponse('{"language": null, "text": "", "english": ""}')
    ).toEqual(empty);
  });

  it('falls back to plain text when the reply is not JSON', () => {
    expect(parseOcrResponse('  Just the page text.\n')).toEqual({
      language: null,
      text: 'Just the page text.',
      english: 'Just the page text.',
      translated: false,
    });
  });

  it('asks for the JSON shape it parses', () => {
    expect(OCR_PROMPT).toContain('"english"');
    expect(OCR_PROMPT).toContain('"language": null');
  });
});
