import type * as GoogleGenAITypes from '@google/genai';
import * as THREE from 'three';

import type {ImageModel} from 'ai';
import {AI, Tool, type ToolResult} from 'xrblocks';

import {GenerateSkyboxTool} from './GenerateSkyboxTool';

export interface AgentLifecycleCallbacks {
  /** Called when a session starts */
  onSessionStart?: () => void | Promise<void>;
  /** Called when a session ends */
  onSessionEnd?: () => void | Promise<void>;
  /** Called when an error occurs */
  onError?: (error: Error) => void;
}

/**
 * State information for a live session.
 */
export interface LiveSessionState {
  /** Whether the session is currently active */
  isActive: boolean;
  /** Timestamp when session started */
  startTime?: number;
  /** Timestamp when session ended */
  endTime?: number;
  /** Number of messages received */
  messageCount: number;
  /** Number of tool calls executed */
  toolCallCount: number;
  /** Last error message if any */
  lastError?: string;
}

export class SkyboxAgent {
  tools: Tool[];
  private generation = 0;
  private pendingStart?: Promise<void>;

  get isSessionActive() {
    return this.sessionState.isActive;
  }
  private instruction = `You are a friendly and helpful skybox designer. The response should be short. Your only capability
         is to generate a 360-degree equirectangular skybox image based on
         a user's description. You will generate a default skybox if the user
         does not provide any description. You will use the tool 'generateSkybox'
         with the summarized description as the 'prompt' argument to create the skybox.`;

  private sessionState: LiveSessionState = {
    isActive: false,
    messageCount: 0,
    toolCallCount: 0,
  };

  constructor(
    public ai: AI,
    scene: THREE.Scene,
    model: ImageModel,
    public lifecycleCallbacks?: AgentLifecycleCallbacks
  ) {
    this.tools = [new GenerateSkyboxTool(model, scene)];
  }

  findTool(name: string): Tool | undefined {
    return this.tools.find((tool) => tool.name === name);
  }

  getSessionState() {
    return {
      isActive: this.isSessionActive,
      toolCount: this.tools.length,
    };
  }

  /**
   * Starts a live AI session for real-time conversation.
   *
   * @param callbacks - Optional callbacks for session events. Can also be set using ai.setLiveCallbacks()
   * @throws If AI model is not initialized or live session is not available
   *
   * @remarks
   * Audio must be enabled separately using `xb.core.sound.enableAudio()` before starting the session.
   * This gives users control over when microphone permissions are requested.
   */
  startLiveSession(callbacks?: GoogleGenAITypes.LiveCallbacks): Promise<void> {
    if (this.pendingStart) return this.pendingStart;
    if (this.isSessionActive) return Promise.resolve();
    const generation = ++this.generation;
    this.sessionState = {isActive: false, messageCount: 0, toolCallCount: 0};
    const assertCurrent = () => {
      if (
        generation !== this.generation ||
        this.sessionState.endTime !== undefined
      ) {
        throw new DOMException('Live session start cancelled.', 'AbortError');
      }
    };
    const start = Promise.resolve().then(async () => {
      try {
        assertCurrent();
        await this.ai.setLiveCallbacks(
          this.wrapCallbacks(callbacks, generation)
        );
        assertCurrent();
        await this.ai.startLiveSession({
          tools: [
            {functionDeclarations: this.tools.map((tool) => tool.toJSON())},
          ],
          systemInstruction: {parts: [{text: this.instruction}]},
        });
        assertCurrent();
        this.sessionState.isActive = true;
        this.sessionState.startTime = Date.now();
        await this.lifecycleCallbacks?.onSessionStart?.();
      } finally {
        if (this.pendingStart === start) this.pendingStart = undefined;
      }
    });
    this.pendingStart = start;
    return start;
  }

  /**
   * Stops the live AI session.
   *
   * @remarks
   * Audio must be disabled separately using `xb.core.sound.disableAudio()` after stopping the session.
   */
  async stopLiveSession() {
    ++this.generation;
    this.pendingStart = undefined;
    await Promise.all([this.ai.stopLiveSession(), this.endSession()]);
  }

  async dispose() {
    try {
      await this.stopLiveSession();
    } finally {
      for (const tool of this.tools) {
        if (tool instanceof GenerateSkyboxTool) tool.dispose();
      }
    }
  }

  private async endSession() {
    if (this.sessionState.endTime !== undefined) return;
    const wasActive = this.sessionState.isActive;
    this.sessionState.isActive = false;
    this.sessionState.endTime = Date.now();
    if (wasActive) await this.lifecycleCallbacks?.onSessionEnd?.();
  }

  /**
   * Wraps user callbacks to track session state and trigger lifecycle events.
   * @param callbacks - The callbacks to wrap.
   * @returns The wrapped callbacks.
   */
  private wrapCallbacks(
    callbacks: GoogleGenAITypes.LiveCallbacks | undefined,
    generation: number
  ): GoogleGenAITypes.LiveCallbacks {
    return {
      onopen: () => {
        if (generation !== this.generation) return;
        callbacks?.onopen?.();
      },
      onmessage: (message: GoogleGenAITypes.LiveServerMessage) => {
        if (generation !== this.generation) return;
        this.sessionState.messageCount++;
        callbacks?.onmessage?.(message);
      },
      onerror: (error: ErrorEvent) => {
        if (generation !== this.generation) return;
        this.sessionState.lastError = error.message;
        this.lifecycleCallbacks?.onError?.(new Error(error.message));
        callbacks?.onerror?.(error);
      },
      onclose: (event: CloseEvent) => {
        if (generation !== this.generation) return;
        void this.endSession().catch((error) =>
          this.lifecycleCallbacks?.onError?.(error)
        );
        callbacks?.onclose?.(event);
      },
    };
  }

  /**
   * Sends tool execution results back to the AI.
   *
   * @param response - The tool response containing function results
   */
  async sendToolResponse(
    response: GoogleGenAITypes.LiveSendToolResponseParameters
  ) {
    const responses = Array.isArray(response.functionResponses)
      ? response.functionResponses
      : response.functionResponses
        ? [response.functionResponses]
        : [];
    if (
      !responses.length ||
      !responses.every((fr) => fr.id && fr.name && fr.response !== undefined)
    ) {
      throw new Error('Invalid tool response format.');
    }
    this.ai.sendToolResponse(response);
    this.sessionState.toolCallCount += responses.length;
  }

  /**
   * Helper to create a properly formatted tool response from a ToolResult.
   *
   * @param id - The function call ID
   * @param name - The function name
   * @param result - The ToolResult from tool execution
   * @returns A properly formatted FunctionResponse
   */
  static createToolResponse(
    id: string,
    name: string,
    result: ToolResult
  ): GoogleGenAITypes.FunctionResponse {
    return {
      id,
      name,
      response: result.success ? {result: result.data} : {error: result.error},
    };
  }

  /**
   * Gets the current live session state.
   *
   * @returns Read-only session state information
   */
  getLiveSessionState(): Readonly<LiveSessionState> {
    return {...this.sessionState};
  }

  /**
   * Gets the duration of the session in milliseconds.
   *
   * @returns Duration in ms, or null if session hasn't started
   */
  getSessionDuration(): number | null {
    if (!this.sessionState.startTime) return null;
    const endTime = this.sessionState.endTime || Date.now();
    return endTime - this.sessionState.startTime;
  }
}
