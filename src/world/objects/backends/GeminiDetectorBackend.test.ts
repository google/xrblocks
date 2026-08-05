import type {ThinkingLevel} from '@google/genai';
import {describe, expect, it} from 'vitest';

import {WorldOptions} from '../../WorldOptions';
import type {DetectorBackendContext} from '../ObjectDetectorBackend';

import {GeminiDetectorBackend} from './GeminiDetectorBackend';

interface TestableGeminiDetectorBackend {
  buildGeminiConfig(): {
    thinkingConfig: {
      thinkingLevel: ThinkingLevel;
      thinkingBudget?: number;
    };
  };
}

describe('GeminiDetectorBackend', () => {
  it('uses the Gemini 3 thinking-level contract', () => {
    const context = {
      options: new WorldOptions(),
    } as DetectorBackendContext;
    const backend = new GeminiDetectorBackend(context);

    const config = (
      backend as unknown as TestableGeminiDetectorBackend
    ).buildGeminiConfig();

    expect(config.thinkingConfig).toEqual({
      thinkingLevel: 'MINIMAL',
    });
    expect(config.thinkingConfig).not.toHaveProperty('thinkingBudget');
  });
});
