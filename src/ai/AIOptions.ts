import * as GoogleGenAITypes from '@google/genai';

export const GEMINI_DEFAULT_FLASH_MODEL = 'gemini-3.5-flash';
export const GEMINI_DEFAULT_LIVE_MODEL = 'gemini-3.1-flash-live-preview';
export const GEMINI_DEFAULT_IMAGE_MODEL = 'gemini-3.1-flash-image-preview';

export class GeminiOptions {
  apiKey = '';
  urlParam = 'geminiKey';
  keyValid = false;
  enabled = false;
  model = GEMINI_DEFAULT_FLASH_MODEL;
  liveModel = GEMINI_DEFAULT_LIVE_MODEL;
  config: GoogleGenAITypes.GenerateContentConfig = {};
}

export class OpenAIOptions {
  apiKey = '';
  urlParam = 'openaiKey';
  model = 'gpt-4.1';
  enabled = false;
}

export type AIModel = 'gemini' | 'openai';

export class AIOptions {
  enabled = false;
  model: AIModel = 'gemini';
  gemini = new GeminiOptions();
  openai = new OpenAIOptions();
  globalUrlParams = {
    key: 'key', // Generic key parameter
  };
}
