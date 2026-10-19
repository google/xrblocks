export const GEMINI_DEFAULT_LIVE_MODEL = 'gemini-3.8-live';

export class GeminiOptions {
  apiKey = '';
  urlParam = 'geminiKey';
  enabled = false;
  liveModel = GEMINI_DEFAULT_LIVE_MODEL;
}

export class AIOptions {
  enabled = false;
  /**
   * Show a browser dialog before AI starts so a prototype user can provide,
   * replace, or remove an API key kept only for the current page. Disabled by
   * default. The dialog is skipped when the page URL or keys.json already
   * provides a key.
   */
  promptForApiKey = false;
  gemini = new GeminiOptions();
  globalUrlParams = {
    key: 'key', // Generic key parameter
  };
}
