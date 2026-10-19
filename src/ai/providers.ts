import type {GoogleProvider, GoogleProviderSettings} from '@ai-sdk/google';
import type {OpenAIProvider, OpenAIProviderSettings} from '@ai-sdk/openai';

import {resolveApiKey, type ResolveApiKeyOptions} from './resolveApiKey';

export type CreateGoogleOptions = GoogleProviderSettings & ResolveApiKeyOptions;
export type CreateOpenAIOptions = OpenAIProviderSettings & ResolveApiKeyOptions;

export async function createGoogle(
  options: CreateGoogleOptions = {}
): Promise<GoogleProvider> {
  const {promptForApiKey, ...settings} = options;
  const [{createGoogle}, apiKey] = await Promise.all([
    import('@ai-sdk/google'),
    resolveApiKey('google', {apiKey: settings.apiKey, promptForApiKey}),
  ]);
  return createGoogle({...settings, apiKey});
}

export async function createOpenAI(
  options: CreateOpenAIOptions = {}
): Promise<OpenAIProvider> {
  const {promptForApiKey, ...settings} = options;
  const [{createOpenAI}, apiKey] = await Promise.all([
    import('@ai-sdk/openai'),
    resolveApiKey('openai', {apiKey: settings.apiKey, promptForApiKey}),
  ]);
  return createOpenAI({...settings, apiKey});
}
