import type OpenAIType from 'openai';

import {OpenAIOptions} from './AIOptions';
import {BaseAIModel} from './BaseAIModel';

let OpenAIApi: typeof OpenAIType|null = null;

async function loadOpenAIModule() {
  if (OpenAIApi) {
    return;
  }
  try {
    const openAIModule = await import('openai');
    OpenAIApi = openAIModule.default;
    console.log('\'openai\' module loaded successfully.');
  } catch (error) {
    console.warn(
        '\'openai\' module not found. Using fallback implementations.',
        'Error details:', error);
  }
}

export class OpenAI extends BaseAIModel {
  openai?: OpenAIType;

  constructor(protected options: OpenAIOptions) {
    super();
  }

  async init() {
    await loadOpenAIModule();
    if (this.options.apiKey && OpenAIApi) {
      this.openai = new OpenAIApi(
          {apiKey: this.options.apiKey, dangerouslyAllowBrowser: true});
      console.log('OpenAI model initialized');
    } else {
      console.error('OpenAI API key is missing or module failed to load.');
    }
  }

  isAvailable() {
    return !!this.openai;
  }

  async query(input: {prompt: string}, _tools?: never[]) {
    if (!this.isAvailable()) {
      throw new Error('OpenAI model is not initialized.');
    }

    try {
      const completion = await this.openai!.chat.completions.create({
        messages: [{role: 'user', content: input.prompt}],
        model: this.options.model,
      });
      const content = completion.choices[0].message.content;
      if (content) {
        return {text: content};
      }
      return null;
    } catch (error) {
      console.error('Error querying OpenAI:', error);
      throw error;
    }
  }

  async generate() {
    throw new Error('Wrapper not implemented');
  }
}
