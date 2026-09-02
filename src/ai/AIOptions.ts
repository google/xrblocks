import type * as GoogleGenAITypes from '@google/genai';

export const GEMINI_DEFAULT_FLASH_MODEL = 'gemini-3.8-flash';
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
   * replace, or remove an API key kept only for the current page. Disabled by
   * default. The dialog is skipped when the page URL or keys.json already
   * provides a key.
   */
  promptForApiKey = false;
  gemini = new GeminiOptions();
  openai = new OpenAIOptions();
  globalUrlParams = {
    key: 'key', // Generic key parameter
  };
}
