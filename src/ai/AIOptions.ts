import type * as GoogleGenAITypes from '@google/genai';

export const GEMINI_DEFAULT_FLASH_MODEL = 'gemini-3.6-flash';
export const GEMINI_DEFAULT_LIVE_MODEL = 'gemini-3.1-flash-live-preview';
export const GEMINI_DEFAULT_IMAGE_MODEL = 'gemini-3.1-flash-image';

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
  /**
   * Show a browser dialog before AI starts so a prototype user can provide,
   * replace, or remove a locally stored API key. Disabled by default.
   */
  promptForApiKey = false;
  gemini = new GeminiOptions();
  openai = new OpenAIOptions();
  globalUrlParams = {
    key: 'key', // Generic key parameter
  };
}
