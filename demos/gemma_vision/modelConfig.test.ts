import {describe, expect, it} from 'vitest';

import {
  CACHE_NAME,
  DEFAULT_MODEL,
  getModel,
  IMAGE_BUDGET,
  MODEL_BASE,
  MODEL_BYTES,
  MODEL_FILES,
  MODEL_ID,
  MODELS,
  REVISION,
} from './modelConfig.js';
import {PRESETS} from './conversation.js';

describe('vision model registry', () => {
  it('keeps Gemma keys identical to the original manifest so caches still match', () => {
    const gemma = MODELS.gemma;
    expect(DEFAULT_MODEL).toBe('gemma');
    expect(gemma).toMatchObject({
      key: 'gemma',
      family: 'gemma4',
      modelId: MODEL_ID,
      revision: REVISION,
      base: MODEL_BASE,
      files: MODEL_FILES,
      bytes: MODEL_BYTES,
      imageBudget: IMAGE_BUDGET,
    });
    expect(CACHE_NAME).toBe('xrblocks-gemma-vision-4.3.0');
  });

  it('pins Lite to SmolVLM2 500M q4f16 with exact file sizes', () => {
    const lite = MODELS.lite;
    expect(lite.modelId).toBe('HuggingFaceTB/SmolVLM2-500M-Video-Instruct');
    expect(lite.revision).toBe('7b375e1b73b11138ff12fe22c8f2822d8fe03467');
    expect(lite.base).toBe(
      `https://huggingface.co/${lite.modelId}/resolve/${lite.revision}/`
    );
    expect(lite.files).toEqual({
      'onnx/decoder_model_merged_q4f16.onnx': 205328508,
      'onnx/embed_tokens_q4f16.onnx': 94618005,
      'onnx/vision_encoder_q4f16.onnx': 57691749,
      'config.json': 3767,
      'generation_config.json': 136,
      'preprocessor_config.json': 599,
      'processor_config.json': 67,
      'chat_template.json': 430,
      'tokenizer.json': 3548256,
      'tokenizer_config.json': 28626,
    });
    expect(lite.bytes).toBe(361220143);
    expect(lite.imageBudget).toBe(64);
    expect(lite.imageBudgets).toEqual([64, 320]);
  });

  it.each(Object.values(MODELS))(
    '$key has a complete, consistent entry',
    (model) => {
      expect(model.revision).toMatch(/^[a-f0-9]{40}$/);
      expect(model.base).not.toMatch(/\/(main|latest)\//);
      expect(Object.values(model.files).reduce((a, b) => a + b, 0)).toBe(
        model.bytes
      );
      for (const file of Object.values(model.processorFiles)) {
        expect(model.files).toHaveProperty(file);
      }
      expect(Object.keys(model.files).some((file) => /audio/.test(file))).toBe(
        model.key === 'gemma'
      );
      expect(model.imageBudgets).toContain(model.imageBudget);
      expect(model.eosTokens.length).toBeGreaterThan(0);
      const presetIds = PRESETS.map(({id}) => id);
      for (const id of model.presets) expect(presetIds).toContain(id);
      expect(model.choiceLabel).toMatch(/^[\x20-\x7e]{1,24}$/);
      expect(model.downloadLabel).toMatch(/^Download /);
      expect(model.cachedLabel).toMatch(/^Load cached /);
      expect(Object.isFrozen(model)).toBe(true);
    }
  );

  it('offers translation only where the model handles it', () => {
    expect(MODELS.gemma.presets).toContain('translate');
    expect(MODELS.lite.presets).not.toContain('translate');
  });

  it('rejects unknown model keys', () => {
    expect(getModel('lite')).toBe(MODELS.lite);
    for (const key of ['', 'toString', '__proto__', undefined, 3]) {
      expect(() => getModel(key)).toThrow(/Unknown vision model/);
    }
  });
});
