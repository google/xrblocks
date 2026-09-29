import {afterEach, describe, expect, expectTypeOf, it, vi} from 'vitest';

import {AI} from './AI';
import {AIOptions, GeminiOptions, OpenAIOptions} from './AIOptions';
import {Gemini} from './Gemini';
import {OpenAI} from './OpenAI';

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AI.generate', () => {
  it('infers an optional model string for TypeScript callers', () => {
    expectTypeOf<Parameters<AI['generate']>[3]>().toEqualTypeOf<
      string | undefined
    >();
  });

  it('forwards an explicit model to Gemini', async () => {
    const ai = new AI();
    ai.model = new Gemini(new GeminiOptions());
    vi.spyOn(ai.model, 'isAvailable').mockReturnValue(true);
    const generate = vi
      .spyOn(ai.model, 'generate')
      .mockResolvedValue('data:image/png;base64,image');

    await expect(
      ai.generate('a tree', 'image', 'Draw a tree', 'custom-image-model')
    ).resolves.toBe('data:image/png;base64,image');
    expect(generate).toHaveBeenCalledWith(
      'a tree',
      'image',
      'Draw a tree',
      'custom-image-model'
    );
  });

  it('leaves the default model selection to Gemini', async () => {
    const ai = new AI();
    ai.model = new Gemini(new GeminiOptions());
    vi.spyOn(ai.model, 'isAvailable').mockReturnValue(true);
    const generate = vi.spyOn(ai.model, 'generate').mockResolvedValue('image');

    await ai.generate('a tree');

    expect(generate).toHaveBeenCalledWith(
      'a tree',
      'image',
      'Generate an image',
      undefined
    );
  });

  it('rejects when AI is unavailable', async () => {
    await expect(new AI().generate('a tree')).rejects.toThrow(
      'AI is not available.'
    );
  });

  it('preserves the unsupported-backend error for OpenAI', async () => {
    const ai = new AI();
    ai.options = new AIOptions();
    ai.options.model = 'openai';
    ai.model = new OpenAI(new OpenAIOptions());
    vi.spyOn(ai.model, 'isAvailable').mockReturnValue(true);
    const generate = vi.spyOn(ai.model, 'generate');

    await expect(ai.generate('a tree')).rejects.toThrow(
      'openai does not support generate().'
    );
    expect(generate).not.toHaveBeenCalled();
  });
});
