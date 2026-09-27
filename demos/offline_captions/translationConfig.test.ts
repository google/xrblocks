import {describe, expect, it} from 'vitest';

import {ASSETS, ORT_BASE, RUNTIME_URL} from './modelConfig.js';
import {
  LANGUAGES,
  TRANSLATION_DTYPE,
  getLanguage,
} from './translationConfig.js';

const MODEL_FILES = [
  'config.json',
  'generation_config.json',
  'tokenizer.json',
  'tokenizer_config.json',
  'onnx/encoder_model_quantized.onnx',
  'onnx/decoder_model_merged_quantized.onnx',
];

describe('translation manifest', () => {
  it('offers Spanish, French and German Opus-MT models', () => {
    expect(
      LANGUAGES.map(({code, label, model}) => [code, label, model])
    ).toEqual([
      ['es', 'Spanish', 'Xenova/opus-mt-en-es'],
      ['fr', 'French', 'Xenova/opus-mt-en-fr'],
      ['de', 'German', 'Xenova/opus-mt-en-de'],
    ]);
    expect(TRANSLATION_DTYPE).toBe('q8');
    expect(getLanguage('fr').label).toBe('French');
    expect(() => getLanguage('xx')).toThrow(/Unknown/);
  });

  it('pins every file to an exact revision, size and SHA-256', () => {
    const ort = ASSETS.filter(({url}) => url.startsWith(ORT_BASE));
    expect(ort).toHaveLength(2);
    for (const language of LANGUAGES) {
      expect(language.revision).toMatch(/^[0-9a-f]{40}$/);
      expect(language.base).toBe(
        `https://huggingface.co/${language.model}/resolve/${language.revision}/`
      );
      const model = language.assets.slice(0, MODEL_FILES.length);
      expect(model.map(({file}) => file)).toEqual(MODEL_FILES);
      for (const asset of language.assets) {
        expect(Number.isSafeInteger(asset.bytes) && asset.bytes > 0).toBe(true);
        expect(asset.sha256).toMatch(/^[0-9a-f]{64}$/);
        expect(Object.isFrozen(asset)).toBe(true);
      }
      for (const asset of model) {
        expect(asset.url).toBe(language.base + asset.file);
      }
      // ONNX Runtime is shared with the captions model, so it caches once.
      expect(language.assets.slice(MODEL_FILES.length)).toEqual(ort);
      expect(language.modelBytes).toBe(
        model.reduce((sum, {bytes}) => sum + bytes, 0)
      );
    }
    expect(RUNTIME_URL).toContain('@huggingface/transformers@4.3.0/');
  });

  it('shows the per-language download size', () => {
    expect(LANGUAGES.map(({downloadLabel}) => downloadLabel)).toEqual([
      'Download Spanish (~119 MB)',
      'Download French (~113 MB)',
      'Download German (~112 MB)',
    ]);
    expect(getLanguage('de').cachedLabel).toBe('Load cached German');
    expect(getLanguage('de').loadedLabel).toBe('German ready');
  });
});
