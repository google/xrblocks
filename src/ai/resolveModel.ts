import type {LanguageModel} from 'ai';

import {ApiKeyResolver} from './ApiKeyResolver';

export interface ResolveModelOptions {
  apiKey?: string;
  promptForApiKey?: boolean;
}

const credentials = new ApiKeyResolver();

export async function resolveModel(
  identifier: string,
  options: ResolveModelOptions = {}
): Promise<LanguageModel> {
  const separator = identifier.indexOf(':');
  if (separator <= 0 || separator === identifier.length - 1) {
    throw new Error('Expected a model identifier in provider:model format.');
  }
  const provider = identifier.slice(0, separator);
  const model = identifier.slice(separator + 1);
  if (provider !== 'google' && provider !== 'openai') {
    throw new Error(`Unsupported model provider: ${provider}`);
  }

  const credential = provider === 'google' ? 'gemini' : 'openai';
  const keyOptions = {
    provider: credential,
    apiKey: options.apiKey ?? '',
    urlParam: `${credential}Key`,
    globalUrlParam: 'key',
    promptForApiKey: options.promptForApiKey ?? false,
  } as const;
  const apiKey =
    (options.promptForApiKey
      ? await credentials.request(keyOptions)
      : await credentials.resolve(keyOptions)) || undefined;

  if (provider === 'google') {
    const {createGoogle} = await import('@ai-sdk/google');
    return createGoogle({apiKey})(model);
  }

  const {createOpenAI} = await import('@ai-sdk/openai');
  return createOpenAI({apiKey})(model);
}
