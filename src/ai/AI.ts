import type * as GoogleGenAITypes from '@google/genai';

import {Script} from '../core/Script';
import {isRunningInGeminiCanvas} from '../utils/EnvironmentUtils';

import {AIOptions} from './AIOptions';
import {ApiKeyResolver, isValidApiKey} from './ApiKeyResolver';
import {GeminiLive} from './GeminiLive';

export class AI extends Script {
  static dependencies = {aiOptions: AIOptions};
  editorIcon = 'network_intelligence';
  private live?: GeminiLive;
  private initialization = 0;
  options!: AIOptions;
  private credentials = new ApiKeyResolver();

  async init({aiOptions}: {aiOptions: AIOptions}) {
    const initialization = ++this.initialization;
    this.live?.dispose();
    this.live = undefined;
    this.options = aiOptions;

    if (!aiOptions.enabled || !aiOptions.gemini.enabled) {
      console.log('Gemini Live is disabled in options');
      return;
    }

    const apiKey = await this.credentials.request(this.credentialOptions());
    if (initialization !== this.initialization) return;
    aiOptions.gemini.apiKey = apiKey;
    const live = new GeminiLive(aiOptions.gemini);
    try {
      await live.init();
      if (initialization !== this.initialization) {
        live.dispose();
        return;
      }
      this.live = live;
    } catch (error) {
      live.dispose();
      if (initialization === this.initialization) {
        console.error('Failed to initialize Gemini Live:', error);
      }
    }
  }

  private credentialOptions() {
    return {
      provider: 'gemini' as const,
      apiKey: this.options.gemini.apiKey,
      urlParam: this.options.gemini.urlParam,
      globalUrlParam: this.options.globalUrlParams.key,
      promptForApiKey: this.options.promptForApiKey,
    };
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
    return this.live.startLiveSession(config, model);
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
    ++this.initialization;
    this.live?.dispose();
    this.live = undefined;
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
    return this.live?.isLiveAvailable() ?? false;
  }

  async hasApiKey() {
    if (!this.options) return false;
    if (isRunningInGeminiCanvas()) return true;
    const apiKey = await this.credentials.resolve(this.credentialOptions());
    return !!apiKey && isValidApiKey(apiKey);
  }
}
