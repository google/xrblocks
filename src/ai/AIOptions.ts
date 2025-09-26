export interface GeminiLiveOptions {
  enabled?: boolean;
  model?: string;
  startOfSpeechSensitivity?: 'LOW'|'HIGH';
  endOfSpeechSensitivity?: 'LOW'|'HIGH';
  voiceName?: string;
  screenshotInterval?: number;
  audioConfig?: {
    sampleRate?: number;
    channelCount?: number;
    echoCancellation?: boolean;
    noiseSuppression?: boolean;
    autoGainControl?: boolean;
  };
}

export class GeminiOptions {
  apiKey = '';
  urlParam = 'geminiKey';
  keyValid = false;
  enabled = false;
  model = 'gemini-2.0-flash';
  config = {};
  live: GeminiLiveOptions = {
    enabled: false,
    model: 'gemini-live-2.5-flash-preview',
    voiceName: 'Aoede',
    screenshotInterval: 3000,
    audioConfig: {
      sampleRate: 16000,
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true
    }
  };
}

export class OpenAIOptions {
  apiKey = '';
  urlParam = 'openaiKey';
  model = 'gpt-4.1';
  enabled = false;
}

export type AIModel = 'gemini'|'openai';

export class AIOptions {
  enabled = false;
  model: AIModel = 'gemini';
  gemini = new GeminiOptions();
  openai = new OpenAIOptions();
  globalUrlParams = {
    key: 'key',  // Generic key parameter
  }
}
