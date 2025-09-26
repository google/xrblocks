import type * as GoogleGenAITypes from '@google/genai';

import {Script} from '../core/Script';
import {getUrlParameter} from '../utils/utils';

import {AIOptions, GeminiOptions, OpenAIOptions} from './AIOptions';
import {GeminiResponse} from './AITypes';
import {Gemini} from './Gemini';
import {OpenAI} from './OpenAI';

export type ModelClass = Gemini|OpenAI;
export type ModelOptions = GeminiOptions|OpenAIOptions;

export type KeysJson = {
  [key: string]:
      string|{
        apiKey?: string;
      }
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
 *    - URL Parameter: ?key=\<api_key\>
 *    - keys.json file: Local configuration file
 *    - User Prompt: Interactive fallback
 * 2. keys.json Support:
 *    - Structure: \{"gemini": \{"apiKey": "YOUR_KEY_HERE"\}\}
 *    - Automatically loads if present
 */
export class AI extends Script {
  static dependencies = {aiOptions: AIOptions};

  model?: ModelClass;
  lock = false;
  options!: AIOptions;
  keysCache?: KeysJson;  // Cache for loaded keys.json

  /**
   * Load API keys from keys.json file if available
   * Parsed keys object or null if not found
   */
  async loadKeysFromFile(): Promise<KeysJson|null> {
    if (this.keysCache) return this.keysCache;

    try {
      const response = await fetch('./keys.json');
      if (response.ok) {
        this.keysCache = await response.json() as KeysJson;
        console.log('🔑 Loaded keys.json');
        return this.keysCache;
      }
    } catch {
      // Silent fail - keys.json is optional
    }
    return null;
  }

  async init({aiOptions}: {aiOptions: AIOptions}) {
    this.lock = false;
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
      ModelClass: typeof Gemini|typeof OpenAI, modelOptions: ModelOptions) {
    const apiKey = await this.resolveApiKey(modelOptions);
    if (!apiKey || !this.isValidApiKey(apiKey)) {
      console.error(`No valid API key found for ${this.options.model}`);
      return;
    }
    modelOptions.apiKey = apiKey;
    this.model = new ModelClass(modelOptions as GeminiOptions & OpenAIOptions);
    try {
      await this.model.init();
      console.log(`${this.options.model} initialized`);
    } catch (error) {
      console.error(`Failed to initialize ${this.options.model}:`, error);
      this.model = undefined;
    }
  }

  async resolveApiKey(modelOptions: ModelOptions): Promise<string|null> {
    const modelName = this.options.model;

    // 1. Check options
    if (modelOptions.apiKey) {
      return modelOptions.apiKey;
    }

    // 2. Check URL parameters for 'key'
    const genericKey = getUrlParameter('key');
    if (genericKey) {
      return genericKey;
    }

    // 3. Check URL parameters for model-specific key
    const modelKey = getUrlParameter(modelOptions.urlParam);
    if (modelKey) return modelKey;

    // Temporary fallback to geminiKey64 for teamfood.
    const geminiKey64 = getUrlParameter('geminiKey64');
    if (geminiKey64) {
      return window.atob(geminiKey64);
    }

    // 3. Check keys.json file
    const keysFromFile = await this.loadKeysFromFile();
    if (keysFromFile) {
      const modelNameWithApiKeySuffix = modelName + `ApiKey`;
      let keyFromFile: string|null|undefined = null;
      if (typeof keysFromFile[modelName] === 'object') {
        keyFromFile = keysFromFile[modelName]?.apiKey;
      } else if (typeof keysFromFile[modelNameWithApiKeySuffix] === 'string') {
        keyFromFile = keysFromFile[modelNameWithApiKeySuffix];
      } else if (typeof keysFromFile[modelName] === 'string') {
        keyFromFile = keysFromFile[modelName];
      }
      if (keyFromFile) {
        console.log(`🔑 Using ${modelName} key from keys.json`);
        return keyFromFile;
      }
    }

    return null;
  }

  isValidApiKey(key: string) {
    return key && typeof key === 'string' && key.length > 0;
  }

  isAvailable() {
    return this.model && this.model.isAvailable() && !this.lock;
  }

  async query(input: {prompt: string}, tools?: never[]):
      Promise<GeminiResponse|string|null> {
    if (!this.isAvailable()) {
      throw new Error(
          'AI is not available. Check if it\'s enabled and properly initialized.');
    }
    return await this.model!.query(input, tools);
  }

  async startLiveSession(config = {}) {
    if (!this.model) {
      throw new Error('AI model is not initialized.');
    }
    if (!('isLiveAvailable' in this.model) || !this.model.isLiveAvailable()) {
      throw new Error('Live session is not available for the current model.');
    }
    this.lock = true;
    try {
      const session = await this.model.startLiveSession(config);
      return session;
    } catch (error) {
      this.lock = false;
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
    } finally {
      this.lock = false;
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
    return this.model && 'isLiveAvailable' in this.model &&
        this.model.isLiveAvailable();
  }

  /**
   * In simulator mode, pop up a 2D UI to request Gemini key;
   * In XR mode, show a 3D UI to instruct users to get an API key.
   */
  triggerKeyPopup() {}

  async generate(
      prompt: string|string[], type: 'image' = 'image',
      systemInstruction = 'Generate an image',
      model = 'gemini-2.5-flash-image-preview') {
    return this.model!.generate(prompt, type, systemInstruction, model);
  }

  /**
   * Create a sample keys.json file structure for reference
   * @returns Sample keys.json structure
   */
  static createSampleKeysStructure() {
    return {
      'gemini': {'apiKey': 'YOUR_GEMINI_API_KEY_HERE'},
      'openai': {'apiKey': 'YOUR_OPENAI_API_KEY_HERE'},
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

    const apiKey = await this.resolveApiKey(modelOptions);
    return apiKey && this.isValidApiKey(apiKey);
  }
}
