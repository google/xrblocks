import type * as GoogleGenAITypes from '@google/genai';

import {Script} from '../core/Script';

import {AIOptions, GeminiOptions, OpenAIOptions} from './AIOptions';
import {ApiKeyResolver, isValidApiKey} from './ApiKeyResolver';
import {GeminiResponse} from './AITypes';
import {Gemini, GeminiQueryInput} from './Gemini';
import {OpenAI} from './OpenAI';
import {GeminiLive} from './GeminiLive';

export type ModelClass = Gemini | OpenAI;
export type ModelOptions = GeminiOptions | OpenAIOptions;

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
 *    - Current-page memory
 *    - keys.json file
 * 2. keys.json Support:
 *    - Structure: \{"gemini": \{"apiKey": "YOUR_KEY_HERE"\}\}
 *    - Automatically loads if present
 */
export class AI extends Script {
  static dependencies = {aiOptions: AIOptions};
  editorIcon = 'network_intelligence';
  model?: ModelClass;
  private live?: GeminiLive;
  lock = false;
  options!: AIOptions;
  private credentials = new ApiKeyResolver();

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

    if (aiOptions.gemini.enabled) {
      if (modelName !== 'gemini') {
        await this.configureApiKey(aiOptions.gemini, 'gemini');
      }
      this.live = new GeminiLive(aiOptions.gemini);
      try {
        await this.live.init();
      } catch (error) {
        console.error('Failed to initialize Gemini Live:', error);
        this.live = undefined;
      }
    }
  }

  async initializeModel(
    ModelClass: typeof Gemini | typeof OpenAI,
    modelOptions: ModelOptions
  ) {
    await this.configureApiKey(modelOptions, this.options.model);
    this.model = new ModelClass(modelOptions as GeminiOptions & OpenAIOptions);
    try {
      await this.model.init();
      console.log(`${this.options.model} initialized`);
    } catch (error) {
      console.error(`Failed to initialize ${this.options.model}:`, error);
      this.model = undefined;
    }
  }

  private credentialOptions(
    modelOptions: ModelOptions,
    provider = this.options.model
  ) {
    return {
      provider,
      apiKey: modelOptions.apiKey,
      urlParam: modelOptions.urlParam,
      globalUrlParam: this.options.globalUrlParams.key,
      promptForApiKey: this.options.promptForApiKey,
    };
  }

  private async configureApiKey(
    modelOptions: ModelOptions,
    provider = this.options.model
  ) {
    modelOptions.apiKey = await this.credentials.request(
      this.credentialOptions(modelOptions, provider)
    );
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

  /**
   * Concurrent starts share a connection. A start invalidated by stop or dispose
   * rejects with AbortError when the provider returns, closing that late session.
   */
  async startLiveSession(
    config: GoogleGenAITypes.LiveConnectConfig = {},
    model?: string
  ) {
    if (!this.live) {
      throw new Error('AI model is not initialized.');
    }
    if (!this.live.isLiveAvailable()) {
      throw new Error('Live session is not available for the current model.');
    }
    try {
      const session = await this.live.startLiveSession(config, model);
      return session;
    } catch (error) {
      console.error('❌ Failed to start Live session:', error);
      throw error;
    }
  }

  /**
   * Invalidates pending live work and closes any established session. This does
   * not wait for an in-flight provider connection to finish.
   */
  async stopLiveSession() {
    if (!this.live) return;
    try {
      await this.live.stopLiveSession();
    } catch (error) {
      console.error('❌ Error stopping Live session:', error);
    }
  }

  /** Closes live resources synchronously for the Script disposal contract. */
  override dispose(): void {
    this.live?.dispose();
    super.dispose();
  }

  async setLiveCallbacks(callbacks: GoogleGenAITypes.LiveCallbacks) {
    this.live?.setLiveCallbacks(callbacks);
  }

  sendToolResponse(response: GoogleGenAITypes.LiveSendToolResponseParameters) {
    this.live?.sendToolResponse(response);
  }

  sendRealtimeInput(input: GoogleGenAITypes.LiveSendRealtimeInputParameters) {
    if (!this.live) return false;
    return this.live.sendRealtimeInput(input);
  }

  getLiveSessionStatus() {
    return (
      this.live?.getLiveSessionStatus() ?? {
        isActive: false,
        hasSession: false,
        isAvailable: false,
      }
    );
  }

  isLiveAvailable() {
    return this.live?.isLiveAvailable();
  }

  async generate(
    prompt: string | string[],
    type: 'image' = 'image',
    systemInstruction = 'Generate an image',
    model?: string
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

    const apiKey = await this.credentials.resolve(
      this.credentialOptions(modelOptions)
    );
    return apiKey && isValidApiKey(apiKey);
  }
}
