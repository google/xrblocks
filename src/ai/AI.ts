import type * as GoogleGenAITypes from '@google/genai';

import {Script} from '../core/Script';
import {isRunningInGeminiCanvas} from '../utils/EnvironmentUtils';
import {getUrlParameter} from '../utils/utils';

import {AIOptions, GeminiOptions, OpenAIOptions} from './AIOptions';
import {getStoredApiKey, promptForApiKey} from './BrowserApiKeyPrompt';
import {GeminiResponse} from './AITypes';
import {Gemini, GeminiQueryInput} from './Gemini';
import {OpenAI} from './OpenAI';

export type ModelClass = Gemini | OpenAI;
export type ModelOptions = GeminiOptions | OpenAIOptions;

export type KeysJson = {
  gemini?: {apiKey?: string};
  openai?: {apiKey?: string};
};

const SUPPORTED_MODELS = {
  gemini: Gemini,
  openai: OpenAI,
} as const;

/**
 * AI Interface to wrap different AI models (primarily Gemini)
 * Handles both traditional query-based AI interactions and real-time live
 * sessions
 *
 * Features:
 * - Text and multimodal queries
 * - Real-time audio/video AI sessions (Gemini Live)
 * - Advanced API key management with multiple sources
 * - Session locking to prevent concurrent operations
 *
 * The URL param and key.json shortcut is only for demonstration and prototyping
 * practice and we strongly suggest not using it for production or deployment
 * purposes. One should set up a proper server to converse with AI servers in
 * deployment.
 *
 * API Key Management Features:
 *
 * 1. Multiple Key Sources (Priority Order):
 *    - Model option
 *    - Generic and model-specific URL parameters
 *    - Browser local storage
 *    - keys.json file
 * 2. keys.json Support:
 *    - Structure: \{"gemini": \{"apiKey": "YOUR_KEY_HERE"\}\}
 *    - Automatically loads if present
 */
export class AI extends Script {
  static dependencies = {aiOptions: AIOptions};
  editorIcon = 'network_intelligence';
  model?: ModelClass;
  lock = false;
  options!: AIOptions;
  keysCache?: KeysJson; // Cache for loaded keys.json

  /**
   * Load API keys from keys.json file if available
   * Parsed keys object or null if not found
   */
  async loadKeysFromFile(): Promise<KeysJson | null> {
    if (this.keysCache) return this.keysCache;

    try {
      const response = await fetch('./keys.json');
      if (response.ok) {
        this.keysCache = (await response.json()) as KeysJson;
        return this.keysCache;
      }
    } catch {
      // Silent fail - keys.json is optional
    }
    return null;
  }

  async init({aiOptions}: {aiOptions: AIOptions}) {
    this.options = aiOptions;

    if (!aiOptions.enabled) {
      console.log('AI is disabled in options');
      return;
    }

    const modelName = aiOptions.model;
    const ModelClass = SUPPORTED_MODELS[modelName];

    if (ModelClass) {
      const modelOptions = aiOptions[modelName];
      if (modelOptions && modelOptions.enabled) {
        await this.initializeModel(ModelClass, modelOptions);
      } else {
        console.log(`${modelName} is disabled in AI options`);
      }
    } else {
      console.error(`Unsupported AI model: ${modelName}`);
    }
  }

  async initializeModel(
    ModelClass: typeof Gemini | typeof OpenAI,
    modelOptions: ModelOptions
  ) {
    let apiKey = await this.resolveApiKey(modelOptions);
    if (this.options.promptForApiKey && !isRunningInGeminiCanvas()) {
      apiKey = await promptForApiKey(this.options.model, apiKey);
    }
    if (!apiKey || !this.isValidApiKey(apiKey)) {
      // Initialize the model anyway so runtime key flows (e.g. a key prompt
      // or host-injected credentials) can still succeed later.
      if (isRunningInGeminiCanvas()) {
        console.warn(
          `No explicit API key found for ${this.options.model}. ` +
            'Relying on Gemini Canvas host-injected credentials; if queries ' +
            'fail, verify your Google login or report bugs on GitHub.'
        );
      } else {
        console.warn(
          `No valid API key found for ${this.options.model}. ` +
            'Provide one via AIOptions, the ?key= URL parameter, or ' +
            'keys.json; queries will fail until a key is configured.'
        );
      }
    }
    modelOptions.apiKey = apiKey || '';
    this.model = new ModelClass(modelOptions as GeminiOptions & OpenAIOptions);
    try {
      await this.model.init();
      console.log(`${this.options.model} initialized`);
    } catch (error) {
      console.error(`Failed to initialize ${this.options.model}:`, error);
      this.model = undefined;
    }
  }

  async resolveApiKey(modelOptions: ModelOptions): Promise<string | null> {
    const modelName = this.options.model;

    // 1. Check options
    if (modelOptions.apiKey) {
      return modelOptions.apiKey;
    }

    // 2. Check URL parameters for the configured generic key name.
    const genericKey = getUrlParameter(this.options.globalUrlParams.key);
    if (genericKey) {
      return genericKey;
    }

    // 3. Check URL parameters for model-specific key
    const modelKey = getUrlParameter(modelOptions.urlParam);
    if (modelKey) return modelKey;

    // 4. Check the browser-local prototype key when the prompt opt-in owns it.
    if (this.options.promptForApiKey) {
      const storedKey = getStoredApiKey(modelName);
      if (storedKey) return storedKey;
    }

    // 5. Check keys.json file.
    const keysFromFile = await this.loadKeysFromFile();
    if (keysFromFile) {
      const keyFromFile = keysFromFile[modelName]?.apiKey;
      if (keyFromFile) {
        return keyFromFile;
      }
    }

    return null;
  }

  isValidApiKey(key: string) {
    return key && typeof key === 'string' && key.length > 0;
  }

  isAvailable() {
    return this.model && this.model.isAvailable();
  }

  async query(
    input: GeminiQueryInput | {prompt: string},
    tools?: never[]
  ): Promise<GeminiResponse | string | null> {
    if (!this.isAvailable()) {
      throw new Error(
        "AI is not available. Check if it's enabled and properly initialized."
      );
    }
    if (this.model instanceof Gemini) {
      return await this.model.query(input);
    }
    if (typeof input !== 'object' || input === null || !('prompt' in input)) {
      throw new Error(
        `${this.options.model} only supports {prompt: string} query inputs.`
      );
    }
    return await this.model!.query(input, tools);
  }

  async startLiveSession(
    config: GoogleGenAITypes.LiveConnectConfig = {},
    model?: string
  ) {
    if (!this.model) {
      throw new Error('AI model is not initialized.');
    }
    if (!('isLiveAvailable' in this.model) || !this.model.isLiveAvailable()) {
      throw new Error('Live session is not available for the current model.');
    }
    try {
      const session = await this.model.startLiveSession(config, model);
      return session;
    } catch (error) {
      console.error('❌ Failed to start Live session:', error);
      throw error;
    }
  }

  async stopLiveSession() {
    if (!this.model) return;
    try {
      await ('stopLiveSession' in this.model && this.model.stopLiveSession());
    } catch (error) {
      console.error('❌ Error stopping Live session:', error);
    }
  }

  async setLiveCallbacks(callbacks: GoogleGenAITypes.LiveCallbacks) {
    if (this.model && 'setLiveCallbacks' in this.model) {
      this.model.setLiveCallbacks(callbacks);
    }
  }

  sendToolResponse(response: GoogleGenAITypes.LiveSendToolResponseParameters) {
    if (this.model && 'sendToolResponse' in this.model) {
      this.model.sendToolResponse(response);
    }
  }

  sendRealtimeInput(input: GoogleGenAITypes.LiveSendRealtimeInputParameters) {
    if (!this.model || !('sendRealtimeInput' in this.model)) return false;
    return this.model.sendRealtimeInput(input);
  }

  getLiveSessionStatus() {
    if (!this.model || !('getLiveSessionStatus' in this.model)) {
      return {isActive: false, hasSession: false, isAvailable: false};
    }
    return this.model.getLiveSessionStatus();
  }

  isLiveAvailable() {
    return (
      this.model &&
      'isLiveAvailable' in this.model &&
      this.model.isLiveAvailable()
    );
  }

  async generate(
    prompt: string | string[],
    type: 'image' = 'image',
    systemInstruction = 'Generate an image',
    model = undefined
  ) {
    if (!this.isAvailable()) {
      throw new Error(
        "AI is not available. Check if it's enabled and properly initialized."
      );
    }
    if (this.model instanceof Gemini) {
      return this.model.generate(prompt, type, systemInstruction, model);
    }
    throw new Error(`${this.options.model} does not support generate().`);
  }

  /**
   * Create a sample keys.json file structure for reference
   * @returns Sample keys.json structure
   */
  static createSampleKeysStructure() {
    return {
      gemini: {apiKey: 'YOUR_GEMINI_API_KEY_HERE'},
      openai: {apiKey: 'YOUR_OPENAI_API_KEY_HERE'},
    };
  }

  /**
   * Check if the current model has an API key available from any source
   * @returns True if API key is available
   */
  async hasApiKey() {
    if (!this.options) return false;
    const modelOptions = this.options[this.options.model];
    if (!modelOptions) return false;

    if (this.model?.hasApiKey ? await this.model.hasApiKey() : false)
      return true;

    const apiKey = await this.resolveApiKey(modelOptions);
    return apiKey && this.isValidApiKey(apiKey);
  }
}
