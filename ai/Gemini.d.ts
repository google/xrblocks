import * as GoogleGenAITypes from '@google/genai';
import type { Tool } from '../agent/Tool';
import { GeminiOptions } from './AIOptions';
import { GeminiResponse } from './AITypes';
import { BaseAIModel } from './BaseAIModel';
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
}
export declare class Gemini extends BaseAIModel {
    protected options: GeminiOptions;
    inited: boolean;
    liveSession?: GoogleGenAITypes.Session;
    isLiveMode: boolean;
    liveCallbacks: Partial<GoogleGenAITypes.LiveCallbacks>;
    ai?: GoogleGenAITypes.GoogleGenAI;
    constructor(options: GeminiOptions);
    init(): Promise<void>;
    isAvailable(): boolean;
    isLiveAvailable(): false | typeof GoogleGenAITypes.Modality | undefined;
    startLiveSession(params?: {
        tools?: GoogleGenAITypes.FunctionDeclaration[];
        systemInstruction?: GoogleGenAITypes.ContentUnion | string;
    }): Promise<GoogleGenAITypes.Session>;
    stopLiveSession(): Promise<void>;
    setLiveCallbacks(callbacks: GoogleGenAITypes.LiveCallbacks): void;
    sendToolResponse(response: GoogleGenAITypes.LiveSendToolResponseParameters): void;
    sendRealtimeInput(input: GoogleGenAITypes.LiveSendRealtimeInputParameters): void;
    getLiveSessionStatus(): {
        isActive: boolean;
        hasSession: boolean;
        isAvailable: boolean | typeof GoogleGenAITypes.Modality | undefined;
    };
    query(input: GeminiQueryInput | {
        prompt: string;
    }, _tools?: Tool[]): Promise<GeminiResponse | null>;
    generate(prompt: string | string[], type?: 'image', systemInstruction?: string, model?: string): Promise<string | undefined>;
}
