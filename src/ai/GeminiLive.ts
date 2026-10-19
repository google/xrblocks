import type * as GoogleGenAITypes from '@google/genai';
import type {GeminiOptions} from './AIOptions';

export class GeminiLive {
  liveSession?: GoogleGenAITypes.Session;
  isLiveMode = false;
  liveCallbacks: Partial<GoogleGenAITypes.LiveCallbacks> = {};
  private ai?: GoogleGenAITypes.GoogleGenAI;
  private sdk?: typeof GoogleGenAITypes;
  private liveSessionPromise?: Promise<GoogleGenAITypes.Session>;
  private liveSessionGeneration = 0;
  private liveSessionStopped = false;

  constructor(private options: Pick<GeminiOptions, 'apiKey' | 'liveModel'>) {}

  async init() {
    this.sdk = await import('@google/genai');
  }

  private isAvailable() {
    if (!this.sdk?.GoogleGenAI) return false;
    this.ai ??= new this.sdk.GoogleGenAI({apiKey: this.options.apiKey || 'X'});
    return true;
  }

  isLiveAvailable() {
    return !!(
      this.isAvailable() &&
      this.sdk?.EndSensitivity &&
      this.sdk?.StartSensitivity &&
      this.sdk?.Modality
    );
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
      responseModalities: [this.sdk!.Modality.AUDIO],
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
}
