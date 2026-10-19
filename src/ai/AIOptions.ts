import type * as GoogleGenAITypes from '@google/genai';

export const GEMINI_DEFAULT_FLASH_MODEL = 'gemini-3.8-flash';
export const GEMINI_DEFAULT_LIVE_MODEL = 'gemini-3.8-live';
export const GEMINI_DEFAULT_IMAGE_MODEL = 'gemini-3.1-flash-image';

/**
 * Non-live configuration for the Gemini Interactions API
 * (`client.interactions.create`). `model` and `input` come from each query
 * and interactions always run statelessly (`store` is forced off), so
 * history/state parameters are not accepted here.
 */
export type GeminiInteractionConfig = Omit<
  GoogleGenAITypes.Interactions.CreateModelInteractionParamsNonStreaming,
  'model' | 'input' | 'stream' | 'store' | 'previous_interaction_id'
>;

/** Supplies a fresh Gemini ephemeral auth token for each Live session start. */
export type GeminiTokenProvider = () => Promise<string>;

export class GeminiOptions {
  apiKey = '';
  /**
   * Optional async provider for Gemini Live ephemeral tokens. The returned
   * string should be the `name` from `authTokens.create()` (for example,
   * `auth_tokens/...`). It is called for every new Live session; it does not
   * replace `apiKey` for queries or image generation.
   */
  tokenProvider?: GeminiTokenProvider;
  urlParam = 'geminiKey';
  keyValid = false;
  enabled = false;
  model = GEMINI_DEFAULT_FLASH_MODEL;
  liveModel = GEMINI_DEFAULT_LIVE_MODEL;
  config: GeminiInteractionConfig = {};
}

export class OpenAIOptions {
  apiKey = '';
  urlParam = 'openaiKey';
  model = 'gpt-6-luna';
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
