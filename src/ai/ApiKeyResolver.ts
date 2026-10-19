import {isRunningInGeminiCanvas} from '../utils/EnvironmentUtils';
import {getSessionApiKey, promptForApiKey} from './BrowserApiKeyPrompt';

type KeysJson = Record<string, {apiKey?: string} | undefined>;

type ApiKeySource = 'options' | 'url' | 'session' | 'keys.json' | 'none';
type ResolvedApiKey = {key: string | null; source: ApiKeySource};

interface ApiKeyOptions {
  provider: string;
  apiKey: string;
  urlParam: string;
  globalUrlParam: string;
  promptForApiKey: boolean;
}

export function isValidApiKey(key: string) {
  return key && typeof key === 'string' && key.length > 0;
}

export class ApiKeyResolver {
  private keysCache?: KeysJson;

  private async loadKeysFromFile(): Promise<KeysJson | null> {
    if (this.keysCache) return this.keysCache;

    try {
      const response = await fetch('./keys.json');
      if (response.ok) {
        this.keysCache = (await response.json()) as KeysJson;
        return this.keysCache;
      }
    } catch {
      return null;
    }
    return null;
  }

  async resolve(options: ApiKeyOptions): Promise<string | null> {
    return (await this.resolveWithSource(options)).key;
  }

  async request(options: ApiKeyOptions): Promise<string> {
    const resolvedKey = await this.resolveWithSource(options);
    const usesCanvasCredentials =
      (options.provider === 'gemini' || options.provider === 'google') &&
      typeof window !== 'undefined' &&
      isRunningInGeminiCanvas();
    let apiKey = resolvedKey.key;
    const keyBypassesPrompt =
      resolvedKey.source === 'url' || resolvedKey.source === 'keys.json';
    if (
      options.promptForApiKey &&
      !keyBypassesPrompt &&
      !usesCanvasCredentials
    ) {
      apiKey = await promptForApiKey(options.provider, apiKey);
    }
    if (!apiKey || !isValidApiKey(apiKey)) {
      if (usesCanvasCredentials) {
        console.warn(
          `No explicit API key found for ${options.provider}. ` +
            'Relying on Gemini Canvas host-injected credentials; if queries ' +
            'fail, verify your Google login or report bugs on GitHub.'
        );
      } else {
        console.warn(
          `No valid API key found for ${options.provider}. ` +
            'Provide one via AIOptions, the ?key= URL parameter, or ' +
            'keys.json; queries will fail until a key is configured.'
        );
      }
    }
    return apiKey || '';
  }

  private async resolveWithSource(
    options: ApiKeyOptions
  ): Promise<ResolvedApiKey> {
    if (options.apiKey) {
      return {key: options.apiKey, source: 'options'};
    }

    const urlParams = new URLSearchParams(
      typeof window === 'undefined' ? '' : window.location.search
    );
    const urlKey =
      urlParams.get(options.globalUrlParam) ||
      urlParams.get(options.urlParam) ||
      (options.provider === 'google' ? urlParams.get('geminiKey') : null);
    if (urlKey) return {key: urlKey, source: 'url'};

    if (options.promptForApiKey) {
      const sessionKey = getSessionApiKey(options.provider);
      if (sessionKey) return {key: sessionKey, source: 'session'};
    }

    const keysFromFile = await this.loadKeysFromFile();
    if (keysFromFile) {
      const keyFromFile =
        keysFromFile[options.provider]?.apiKey ||
        (options.provider === 'google'
          ? keysFromFile.gemini?.apiKey
          : undefined);
      if (keyFromFile) {
        return {key: keyFromFile, source: 'keys.json'};
      }
    }

    return {key: null, source: 'none'};
  }
}
