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
  /** Called after a tool is executed */
  onToolExecuted?: (toolName: string, result: unknown) => void;
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
  isSessionActive = false;
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
  async startLiveSession(callbacks?: GoogleGenAITypes.LiveCallbacks) {
    // Wrap callbacks to track session state
    const wrappedCallbacks = this.wrapCallbacks(callbacks);

    await this.ai.setLiveCallbacks(wrappedCallbacks);

    const functionDeclarations: GoogleGenAITypes.FunctionDeclaration[] =
      this.tools.map((tool) => tool.toJSON());
    const systemInstruction: GoogleGenAITypes.ContentUnion = {
      parts: [{text: this.instruction}],
    };

    await this.ai.startLiveSession({
      tools: [{functionDeclarations}],
      systemInstruction: systemInstruction,
    });

    this.sessionState.isActive = true;
    this.sessionState.startTime = Date.now();
    this.isSessionActive = true;
    await this.lifecycleCallbacks?.onSessionStart?.();
  }

  /**
   * Stops the live AI session.
   *
   * @remarks
   * Audio must be disabled separately using `xb.core.sound.disableAudio()` after stopping the session.
   */
  async stopLiveSession() {
    await this.ai.stopLiveSession();
    this.sessionState.isActive = false;
    this.sessionState.endTime = Date.now();
    this.isSessionActive = false;
    await this.lifecycleCallbacks?.onSessionEnd?.();
  }

  /**
   * Wraps user callbacks to track session state and trigger lifecycle events.
   * @param callbacks - The callbacks to wrap.
   * @returns The wrapped callbacks.
   */
  private wrapCallbacks(
    callbacks?: GoogleGenAITypes.LiveCallbacks
  ): GoogleGenAITypes.LiveCallbacks {
    return {
      onopen: () => {
        callbacks?.onopen?.();
      },
      onmessage: (message: GoogleGenAITypes.LiveServerMessage) => {
        this.sessionState.messageCount++;
        callbacks?.onmessage?.(message);
      },
      onerror: (error: ErrorEvent) => {
        this.sessionState.lastError = error.message;
        this.lifecycleCallbacks?.onError?.(new Error(error.message));
        callbacks?.onerror?.(error);
      },
      onclose: (event: CloseEvent) => {
        this.sessionState.isActive = false;
        this.sessionState.endTime = Date.now();
        this.isSessionActive = false;
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
    if (!this.validateToolResponse(response)) {
      console.error('Invalid tool response format:', response);
      return;
    }

    // Handle both single response and array of responses
    const responses = Array.isArray(response.functionResponses)
      ? response.functionResponses
      : [response.functionResponses];
    this.sessionState.toolCallCount += responses.length;

    console.log('Sending tool response:', response);
    this.ai.sendToolResponse(response);
  }

  /**
   * Validates that a tool response has the correct format.
   * @param response - The tool response to validate.
   * @returns True if the response is valid, false otherwise.
   */
  private validateToolResponse(
    response: GoogleGenAITypes.LiveSendToolResponseParameters
  ): boolean {
    if (!response.functionResponses) {
      return false;
    }

    // Handle both single response and array of responses
    const responses = Array.isArray(response.functionResponses)
      ? response.functionResponses
      : [response.functionResponses];

    return responses.every(
      (fr) => fr.id && fr.name && fr.response !== undefined
    );
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
