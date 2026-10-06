import * as GoogleGenAITypes from '@google/genai';
import {GEMINI_DEFAULT_IMAGE_MODEL, GeminiOptions} from './AIOptions';
import {GeminiResponse} from './AITypes';
import {BaseAIModel} from './BaseAIModel';
import {isRunningInGeminiCanvas} from '../utils/EnvironmentUtils';

type InteractionContent = GoogleGenAITypes.Interactions.Content;
// Explicit `stream?: false` keeps create() overload resolution on the
// non-streaming variant across @google/genai versions (2.27+ widened the
// namespaced params type to include streaming).
type InteractionParams =
  GoogleGenAITypes.Interactions.CreateModelInteractionParamsNonStreaming & {
    stream?: false;
  };

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

/** Maps an input media type onto the Interactions tagged content blocks. */
function interactionMediaType(
  mimeType: string
): 'image' | 'audio' | 'video' | 'document' {
  const prefix = mimeType.split('/')[0];
  return prefix === 'image' || prefix === 'audio' || prefix === 'video'
    ? prefix
    : 'document';
}

/**
 * Converts the SDK's Part-based payloads into the tagged content blocks the
 * Interactions API accepts as `input`.
 */
function partToInteractionContent(
  part: GoogleGenAITypes.Part
): InteractionContent | null {
  if (part.text !== undefined) {
    return {type: 'text', text: part.text} as InteractionContent;
  }
  const inline = part.inlineData;
  if (inline?.data !== undefined) {
    const mimeType = inline.mimeType ?? 'application/octet-stream';
    return {
      type: interactionMediaType(mimeType),
      mime_type: mimeType,
      data: inline.data,
    } as InteractionContent;
  }
  const file = part.fileData;
  if (file?.fileUri !== undefined) {
    const mimeType = file.mimeType ?? 'application/octet-stream';
    return {
      type: interactionMediaType(mimeType),
      mime_type: mimeType,
      uri: file.fileUri,
    } as InteractionContent;
  }
  console.warn('Unsupported Gemini query part dropped from the input:', part);
  return null;
}

function buildInteractionInput(
  input: GeminiQueryInput | {prompt: string}
): string | InteractionContent[] | null {
  if (!('type' in input)) {
    return input.prompt!;
  }
  switch (input.type) {
    case 'text':
      return input.text!;
    case 'base64':
      return [
        {
          type: 'image',
          mime_type: input.mimeType ?? 'image/png',
          data: input.base64,
        } as InteractionContent,
      ];
    case 'uri':
    case 'multiPart': {
      const parts: GoogleGenAITypes.Part[] =
        input.type === 'uri'
          ? [
              {
                fileData: {fileUri: input.uri!, mimeType: input.mimeType!},
              },
              ...(input.text ? [{text: input.text}] : []),
            ]
          : (input.parts ?? []);
      const blocks = parts
        .map(partToInteractionContent)
        .filter((block): block is InteractionContent => block !== null);
      return blocks.length > 0 ? blocks : null;
    }
    default:
      return null;
  }
}

function findFunctionCallStep(
  interaction: GoogleGenAITypes.Interactions.Interaction
): GoogleGenAITypes.Interactions.FunctionCallStep | undefined {
  for (const step of interaction.steps ?? []) {
    if (step.type === 'function_call') {
      return step;
    }
  }
  return undefined;
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
  private liveSessionPromise?: Promise<GoogleGenAITypes.Session>;
  private liveSessionGeneration = 0;
  private liveSessionStopped = false;

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

  /**
   * Shares a pending connection between concurrent starts. Stopping or disposing
   * invalidates that start; any session returned later is closed and the start
   * rejects with AbortError. The provider cannot be aborted before it returns.
   */
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
    if (this.liveSessionPromise) {
      return this.liveSessionPromise;
    }

    const generation = ++this.liveSessionGeneration;
    this.liveSessionStopped = false;
    const isCurrent = () => generation === this.liveSessionGeneration;
    const isRunning = () => isCurrent() && !this.liveSessionStopped;

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
        if (!isRunning()) return;
        this.isLiveMode = true;
        console.log('🔓 Live session opened.');
        if (this.liveCallbacks?.onopen) {
          this.liveCallbacks.onopen();
        }
      },
      onmessage: (e: GoogleGenAITypes.LiveServerMessage) => {
        if (!isRunning()) return;
        if (this.liveCallbacks?.onmessage) {
          this.liveCallbacks.onmessage(e);
        }
      },
      onerror: (e: ErrorEvent) => {
        if (!isRunning()) return;
        console.error('❌ Live session error:', e);
        if (this.liveCallbacks?.onerror) {
          this.liveCallbacks.onerror(e);
        }
      },
      onclose: (event: CloseEvent) => {
        if (!isCurrent()) return;
        this.liveSessionStopped = true;
        this.liveSessionPromise = undefined;
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
    const connectParams: GoogleGenAITypes.LiveConnectParameters = {
      model: model ?? this.options.liveModel,
      callbacks: callbacks,
      config: defaultConfig,
    };
    // Publish the pending promise before provider callbacks can reenter start.
    this.liveSessionPromise = Promise.resolve().then(async () => {
      try {
        if (!isRunning()) {
          throw new DOMException('Live session start cancelled.', 'AbortError');
        }
        console.log('Connecting with params:', connectParams);
        const session = await this.ai!.live.connect(connectParams);
        if (!isRunning()) {
          session.close();
          throw new DOMException('Live session start cancelled.', 'AbortError');
        }
        this.liveSession = session;
        return session;
      } catch (error) {
        if (isCurrent()) {
          this.liveSessionStopped = true;
          this.isLiveMode = false;
        }
        console.error('❌ Failed to start live session:', error);
        throw error;
      } finally {
        if (isCurrent()) this.liveSessionPromise = undefined;
      }
    });
    return this.liveSessionPromise;
  }

  async stopLiveSession() {
    this.closeLiveSession();
  }

  /** Invalidates live work synchronously without creating a teardown promise. */
  dispose(): void {
    ++this.liveSessionGeneration;
    this.closeLiveSession();
  }

  private closeLiveSession(): void {
    this.liveSessionStopped = true;
    this.liveSessionPromise = undefined;
    const session = this.liveSession;
    this.liveSession = undefined;
    this.isLiveMode = false;
    session?.close();
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

    const interactionInput = buildInteractionInput(input);
    if (interactionInput === null) {
      return {text: null};
    }

    const params: InteractionParams = {
      ...this.options.config,
      model: this.options.model,
      input: interactionInput,
      // Stateless by design: never link interactions into server-side history.
      store: false,
    };
    const interaction = await this.ai!.interactions.create(params);

    const toolCall = findFunctionCallStep(interaction);
    if (toolCall && toolCall.name) {
      return {toolCall: {name: toolCall.name, args: toolCall.arguments}};
    }
    return {text: interaction.output_text || null};
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

    let contents: string | InteractionContent[];

    if (Array.isArray(prompt)) {
      contents = prompt
        .map((item) => {
          if (typeof item === 'string') {
            if (item.startsWith('data:image/')) {
              const [header, data] = item.split(',');
              const mimeType = header.split(';')[0].split(':')[1];
              return partToInteractionContent({inlineData: {mimeType, data}});
            }
            return partToInteractionContent({text: item});
          }
          // Assumes other items are already valid Part objects
          return partToInteractionContent(item);
        })
        .filter((block): block is InteractionContent => block !== null);
    } else {
      contents = prompt;
    }

    const params: InteractionParams = {
      model: model,
      input: contents,
      system_instruction: systemInstruction,
      response_format: [{type: 'image'}],
      // Stateless by design: never link interactions into server-side history.
      store: false,
    };
    const interaction = await this.ai!.interactions.create(params);
    if (type === 'image') {
      for (const step of interaction.steps ?? []) {
        if (step.type !== 'model_output') continue;
        for (const block of step.content ?? []) {
          if (block.type === 'image' && block.data) {
            return (
              'data:' +
              (block.mime_type || 'image/png') +
              ';base64,' +
              block.data
            );
          }
        }
      }
    }
  }

  override async hasApiKey(): Promise<boolean> {
    return this.options.apiKey !== '' || isRunningInGeminiCanvas();
  }
}
