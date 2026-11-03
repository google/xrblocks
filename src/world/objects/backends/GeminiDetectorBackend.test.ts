import {afterEach, describe, expect, it, vi} from 'vitest';

import type {AI} from '../../../ai/AI';
import type {GeminiInteractionConfig} from '../../../ai/AIOptions';
import {WorldOptions} from '../../WorldOptions';
import type {CameraSnapshot, NormalizedDetectedObject} from '../ObjectDetector';
import type {DetectorBackendContext} from '../ObjectDetectorBackend';

import {GeminiDetectorBackend} from './GeminiDetectorBackend';

interface TestableGeminiDetectorBackend {
  buildGeminiConfig(): GeminiInteractionConfig;
  isAvailable(): Promise<boolean>;
  detect(
    snapshot: CameraSnapshot
  ): Promise<NormalizedDetectedObject<unknown>[]>;
}

describe('GeminiDetectorBackend', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

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

  it('logs a one-time warning when AI dependency is missing', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const options = new WorldOptions();
    const context = {options} as DetectorBackendContext;
    const backend = new GeminiDetectorBackend(
      context
    ) as unknown as TestableGeminiDetectorBackend;

    await expect(backend.isAvailable()).resolves.toBe(false);
    await expect(backend.isAvailable()).resolves.toBe(false);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('falls back to ai.options.gemini when aiOptions is omitted and restores config', async () => {
    const options = new WorldOptions();
    const initialConfig = {
      generation_config: {temperature: 0.2},
    } as GeminiInteractionConfig;
    const geminiOptions = {config: initialConfig};
    let configDuringQuery: GeminiInteractionConfig | undefined;
    const query = vi.fn().mockImplementation(async () => {
      configDuringQuery = geminiOptions.config;
      return {
        text: JSON.stringify([
          {ymin: 100, xmin: 200, ymax: 300, xmax: 400, objectName: 'mug'},
        ]),
      };
    });
    const ai = {
      isAvailable: () => true,
      options: {gemini: geminiOptions},
      model: {query},
    } as unknown as AI;
    const context = {options, ai} as DetectorBackendContext;
    const backend = new GeminiDetectorBackend(
      context
    ) as unknown as TestableGeminiDetectorBackend;

    const results = await backend.detect({
      base64: 'data:image/jpeg;base64,c25hcHNob3Q=',
    });

    expect(query).toHaveBeenCalledTimes(1);
    expect(configDuringQuery?.response_format).toBeDefined();
    expect(geminiOptions.config).toBe(initialConfig);
    expect(results).toEqual([
      {
        ymin: 0.1,
        xmin: 0.2,
        ymax: 0.3,
        xmax: 0.4,
        objectName: 'mug',
        additionalData: {},
      },
    ]);
  });

  it('returns empty results when neither aiOptions nor ai.options provides gemini config', async () => {
    const options = new WorldOptions();
    const query = vi.fn();
    const ai = {
      isAvailable: () => true,
      model: {query},
    } as unknown as AI;
    const context = {options, ai} as DetectorBackendContext;
    const backend = new GeminiDetectorBackend(
      context
    ) as unknown as TestableGeminiDetectorBackend;

    const results = await backend.detect({
      base64: 'data:image/jpeg;base64,c25hcHNob3Q=',
    });

    expect(results).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });
});
