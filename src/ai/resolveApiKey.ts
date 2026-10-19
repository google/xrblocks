import {ApiKeyResolver} from './ApiKeyResolver';

export interface ResolveApiKeyOptions {
  apiKey?: string;
  promptForApiKey?: boolean;
}

const credentials = new ApiKeyResolver();

export async function resolveApiKey(
  provider: string,
  options: ResolveApiKeyOptions = {}
): Promise<string | undefined> {
  const keyOptions = {
    provider,
    apiKey: options.apiKey ?? '',
    urlParam: `${provider}Key`,
    globalUrlParam: 'key',
    promptForApiKey: options.promptForApiKey ?? false,
  };
  return (
    (options.promptForApiKey
      ? await credentials.request(keyOptions)
      : await credentials.resolve(keyOptions)) || undefined
  );
}
