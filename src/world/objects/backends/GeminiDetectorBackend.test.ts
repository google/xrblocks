import {describe, expect, it} from 'vitest';

import type {GeminiInteractionConfig} from '../../../ai/AIOptions';
import {WorldOptions} from '../../WorldOptions';
import type {DetectorBackendContext} from '../ObjectDetectorBackend';

import {GeminiDetectorBackend} from './GeminiDetectorBackend';

interface TestableGeminiDetectorBackend {
  buildGeminiConfig(): GeminiInteractionConfig;
}

describe('GeminiDetectorBackend', () => {
  it('uses the Interactions API thinking-level contract', () => {
    const options = new WorldOptions();
    const context = {options} as DetectorBackendContext;
    const backend = new GeminiDetectorBackend(context);

    const config = (
      backend as unknown as TestableGeminiDetectorBackend
    ).buildGeminiConfig();

    const geminiOptions = options.objects.backendConfig.gemini;
    expect(config.generation_config).toEqual({thinking_level: 'low'});
    expect(config.generation_config).not.toHaveProperty('thinkingBudget');
    expect(config.system_instruction).toBe(geminiOptions.systemInstruction);
    expect(config.response_format).toEqual([
      {
        type: 'text',
        mime_type: 'application/json',
        schema: geminiOptions.responseSchema,
      },
    ]);
  });

  it('lets caller generation options override the thinking level', () => {
    const options = new WorldOptions();
    options.objects.backendConfig.gemini.generationConfig = {
      temperature: 0,
      thinking_level: 'minimal',
    };
    const context = {options} as DetectorBackendContext;
    const backend = new GeminiDetectorBackend(context);

    const config = (
      backend as unknown as TestableGeminiDetectorBackend
    ).buildGeminiConfig();

    expect(config.generation_config).toEqual({
      thinking_level: 'minimal',
      temperature: 0,
    });
  });
});
