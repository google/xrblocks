import * as GoogleGenAITypes from '@google/genai';
import {GEMINI_DEFAULT_IMAGE_MODEL, GeminiOptions} from './AIOptions';
import {GeminiResponse} from './AITypes';
import {BaseAIModel} from './BaseAIModel';
import {isRunningInGeminiCanvas} from '../utils/EnvironmentUtils';

let createPartFromUri: (uri: string, mimeType: string) => GoogleGenAITypes.Part;
let createUserContent:
  | ((partOrString: GoogleGenAITypes.PartListUnion) => GoogleGenAITypes.Content)
  | undefined;
let GoogleGenAI: typeof GoogleGenAITypes.GoogleGenAI | undefined;
let EndSensitivity: typeof GoogleGenAITypes.EndSensitivity | undefined;
let StartSensitivity: typeof GoogleGenAITypes.StartSensitivity | undefined;
let Modality: typeof GoogleGenAITypes.Modality | undefined;

// --- Attempt Dynamic Import ---
async function loadGoogleGenAIModule() {
  if (GoogleGenAI) {
    return;
  }
  try {
    const genAIModule = await import('@google/genai');
    if (genAIModule && genAIModule.GoogleGenAI) {
      createPartFromUri = genAIModule.createPartFromUri;
      createUserContent = genAIModule.createUserContent;
      GoogleGenAI = genAIModule.GoogleGenAI;
      EndSensitivity = genAIModule.EndSensitivity;
      StartSensitivity = genAIModule.StartSensitivity;
      Modality = genAIModule.Modality;
      console.log("'@google/genai' module loaded successfully.");
    } else {
      throw new Error("'@google/genai' module loaded but is not valid.");
    }
  } catch (error) {
    const errorMessage = `The '@google/genai' module is required for Gemini but failed to load. Error: ${
      error
    }`;
    console.error(errorMessage);
    throw new Error(errorMessage);
  }
}

export interface GeminiQueryInput {
  type: 'live' | 'text' | 'uri' | 'base64' | 'multiPart';
  action?: 'start' | 'stop' | 'send';
  text?: string;
  uri?: string;
  base64?: string;
  mimeType?: string;
  parts?: GoogleGenAITypes.Part[];
  config?: GoogleGenAITypes.LiveConnectConfig;
  data?: GoogleGenAITypes.LiveSendRealtimeInputParameters;
  useExponentialBackoff?: boolean;
}

export class Gemini extends BaseAIModel {
  inited = false;
  liveSession?: GoogleGenAITypes.Session;
  isLiveMode = false;
  liveCallbacks: Partial<GoogleGenAITypes.LiveCallbacks> = {};
  ai?: GoogleGenAITypes.GoogleGenAI;

  constructor(protected options: GeminiOptions) {
    super();
  }

  async init() {
    await loadGoogleGenAIModule();
  }

  isAvailable() {
    if (!GoogleGenAI) {
      return false;
    }
    if (!this.inited) {
      // Use a random string as API key to avoid Google GenAI from complaining.
      this.ai = new GoogleGenAI({apiKey: this.options.apiKey || 'X'});
      this.inited = true;
    }
    return true;
  }

  isLiveAvailable() {
    return this.isAvailable() && EndSensitivity && StartSensitivity && Modality;
  }

  async startLiveSession(
    params: GoogleGenAITypes.LiveConnectConfig = {},
    model?: string
  ) {
    if (!this.isLiveAvailable()) {
      throw new Error(
        'Live API not available. Make sure @google/genai module is loaded.'
      );
    }

    if (this.liveSession) {
      return this.liveSession;
    }

    const defaultConfig: GoogleGenAITypes.LiveConnectConfig = {
      responseModalities: [Modality!.AUDIO],
      speechConfig: {
        voiceConfig: {prebuiltVoiceConfig: {voiceName: 'Aoede'}},
      },
      outputAudioTranscription: {},
      inputAudioTranscription: {},
      ...params,
    };

    const callbacks: GoogleGenAITypes.LiveCallbacks = {
      onopen: () => {
        this.isLiveMode = true;
        console.log('🔓 Live session opened.');
        if (this.liveCallbacks?.onopen) {
          this.liveCallbacks.onopen();
        }
      },
      onmessage: (e: GoogleGenAITypes.LiveServerMessage) => {
        if (this.liveCallbacks?.onmessage) {
          this.liveCallbacks.onmessage(e);
        }
      },
      onerror: (e: ErrorEvent) => {
        console.error('❌ Live session error:', e);
        if (this.liveCallbacks?.onerror) {
          this.liveCallbacks.onerror(e);
        }
      },
      onclose: (event: CloseEvent) => {
        this.isLiveMode = false;
        this.liveSession = undefined;
        if (event.reason) {
          console.warn('🔒 Live session closed:', event);
        } else {
          console.warn('🔒 Live session closed without reason.');
        }
        if (this.liveCallbacks?.onclose) {
          this.liveCallbacks.onclose(event);
        }
      },
    };
    try {
      const connectParams: GoogleGenAITypes.LiveConnectParameters = {
        model: model ?? this.options.liveModel,
        callbacks: callbacks,
        config: defaultConfig,
      };
      console.log('Connecting with params:', connectParams);
      this.liveSession = await this.ai!.live.connect(connectParams);
      return this.liveSession;
    } catch (error) {
      console.error('❌ Failed to start live session:', error);
      throw error;
    }
  }

  async stopLiveSession() {
    if (!this.liveSession) {
      return;
    }
    this.liveSession.close();
    this.liveSession = undefined;
    this.isLiveMode = false;
  }

  // Set Live session callbacks
  setLiveCallbacks(callbacks: GoogleGenAITypes.LiveCallbacks) {
    this.liveCallbacks = callbacks;
  }

  sendToolResponse(response: GoogleGenAITypes.LiveSendToolResponseParameters) {
    if (this.liveSession) {
      console.debug('Sending tool response to gemini:', response);
      this.liveSession.sendToolResponse(response);
    }
  }

  sendRealtimeInput(input: GoogleGenAITypes.LiveSendRealtimeInputParameters) {
    if (!this.liveSession) {
      return;
    }

    try {
      this.liveSession.sendRealtimeInput(input);
    } catch (error) {
      console.error('❌ Error sending realtime input:', error);
      throw error;
    }
  }

  getLiveSessionStatus() {
    return {
      isActive: this.isLiveMode,
      hasSession: !!this.liveSession,
      isAvailable: this.isLiveAvailable(),
    };
  }

  override async query(
    input: GeminiQueryInput | {prompt: string}
  ): Promise<GeminiResponse | null> {
    const useExponentialBackoff =
      'useExponentialBackoff' in input &&
      input.useExponentialBackoff !== undefined
        ? input.useExponentialBackoff
        : isRunningInGeminiCanvas();
    if (useExponentialBackoff) {
      return this.queryWithExponentialFalloff(input);
    }
    return this.queryOnce(input);
  }

  protected async queryOnce(
    input: GeminiQueryInput | {prompt: string}
  ): Promise<GeminiResponse | null> {
    if (!this.inited) {
      console.warn('Gemini not inited.');
      return null;
    }

    const options = this.options;
    const config: GoogleGenAITypes.GenerateContentConfig = options.config || {};

    if (!('type' in input)) {
      const response = await this.ai!.models.generateContent({
        model: options.model,
        contents: input.prompt!,
        config: config,
      });
      return {text: response.text || null};
    }

    const model = this.ai!.models;
    const modelParams: GoogleGenAITypes.GenerateContentParameters = {
      model: this.options.model,
      contents: [],
      config: this.options.config || {},
    };

    let response = null;
    switch (input.type) {
      case 'text':
        modelParams.contents = input.text!;
        response = await model.generateContent(modelParams);
        break;

      case 'base64':
        if (!input.mimeType) {
          input.mimeType = 'image/png';
        }
        modelParams.contents = {
          inlineData: {
            mimeType: input.mimeType,
            data: input.base64,
          },
        };
        response = await model.generateContent(modelParams);
        break;

      case 'uri':
        modelParams.contents = createUserContent!([
          createPartFromUri(input.uri!, input.mimeType!),
          input.text!,
        ]);
        response = await model.generateContent(modelParams);
        break;

      case 'multiPart':
        modelParams.contents = [{role: 'user', parts: input.parts}];
        response = await model.generateContent(modelParams);
        break;
    }

    if (!response) {
      return {text: null};
    }

    const toolCall = response.functionCalls?.[0];
    if (toolCall && toolCall.name) {
      return {toolCall: {name: toolCall.name, args: toolCall.args}};
    }
    return {text: response.text || null};
  }

  // Try to query multiple times with exponential backoff.
  // Only used within a Gemini Canvas environment.
  protected async queryWithExponentialFalloff(
    input: GeminiQueryInput | {prompt: string}
  ): Promise<GeminiResponse | null> {
    const delays = [1000, 2000, 4000, 8000, 16000];
    let attempt = 0;
    let lastError: unknown | null = null;
    while (attempt < delays.length) {
      try {
        return await this.queryOnce(input);
      } catch (error: unknown) {
        console.warn(`Attempt ${attempt + 1} failed:`, error);
        lastError = error;
        await new Promise((resolve) => setTimeout(resolve, delays[attempt]));
        attempt++;
      }
    }
    console.error('Failed to query with exponential backoff:', lastError);
    return null;
  }

  async generate(
    prompt: string | string[],
    type: 'image' = 'image',
    systemInstruction = 'Generate an image',
    model = GEMINI_DEFAULT_IMAGE_MODEL
  ) {
    if (!this.isAvailable()) return;

    let contents: GoogleGenAITypes.ContentListUnion;

    if (Array.isArray(prompt)) {
      contents = prompt.map((item) => {
        if (typeof item === 'string') {
          if (item.startsWith('data:image/')) {
            const [header, data] = item.split(',');
            const mimeType = header.split(';')[0].split(':')[1];
            return {inlineData: {mimeType, data}};
          } else {
            return {text: item};
          }
        }
        // Assumes other items are already valid Part objects
        return item;
      });
    } else {
      contents = prompt;
    }

    const response = await this.ai!.models.generateContent({
      model: model,
      contents: contents,
      config: {systemInstruction},
    });
    if (response.candidates && response.candidates.length > 0) {
      const firstCandidate = response.candidates[0];
      for (const part of firstCandidate?.content?.parts || []) {
        if (type === 'image' && part.inlineData) {
          return 'data:image/png;base64,' + part.inlineData.data;
        }
      }
    }
  }

  override async hasApiKey(): Promise<boolean> {
    return this.options.apiKey !== '' || isRunningInGeminiCanvas();
  }
}
