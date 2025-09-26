import type * as GoogleGenAITypes from '@google/genai';
import { Script } from '../core/Script';
import { AIOptions, GeminiOptions, OpenAIOptions } from './AIOptions';
import { GeminiResponse } from './AITypes';
import { Gemini } from './Gemini';
import { OpenAI } from './OpenAI';
export type ModelClass = Gemini | OpenAI;
export type ModelOptions = GeminiOptions | OpenAIOptions;
export type KeysJson = {
    [key: string]: string | {
        apiKey?: string;
    };
};
/**
 * AI Interface to wrap different AI models (primarily Gemini)
 * Handles both traditional query-based AI interactions and real-time live
 * sessions
 *
 * Features:
 * - Text and multimodal queries
 * - Real-time audio/video AI sessions (Gemini Live)
 * - Advanced API key management with multiple sources
 * - Session locking to prevent concurrent operations
 *
 * The URL param and key.json shortcut is only for demonstration and prototyping
 * practice and we strongly suggest not using it for production or deployment
 * purposes. One should set up a proper server to converse with AI servers in
 * deployment.
 *
 * API Key Management Features:
 *
 * 1. Multiple Key Sources (Priority Order):
 *    - URL Parameter: ?key=\<api_key\>
 *    - keys.json file: Local configuration file
 *    - User Prompt: Interactive fallback
 * 2. keys.json Support:
 *    - Structure: \{"gemini": \{"apiKey": "YOUR_KEY_HERE"\}\}
 *    - Automatically loads if present
 */
export declare class AI extends Script {
    static dependencies: {
        aiOptions: typeof AIOptions;
    };
    model?: ModelClass;
    lock: boolean;
    options: AIOptions;
    keysCache?: KeysJson;
    /**
     * Load API keys from keys.json file if available
     * Parsed keys object or null if not found
     */
    loadKeysFromFile(): Promise<KeysJson | null>;
    init({ aiOptions }: {
        aiOptions: AIOptions;
    }): Promise<void>;
    initializeModel(ModelClass: typeof Gemini | typeof OpenAI, modelOptions: ModelOptions): Promise<void>;
    resolveApiKey(modelOptions: ModelOptions): Promise<string | null>;
    isValidApiKey(key: string): boolean | "";
    isAvailable(): boolean | undefined;
    query(input: {
        prompt: string;
    }, tools?: never[]): Promise<GeminiResponse | string | null>;
    startLiveSession(config?: {}): Promise<GoogleGenAITypes.Session>;
    stopLiveSession(): Promise<void>;
    setLiveCallbacks(callbacks: GoogleGenAITypes.LiveCallbacks): Promise<void>;
    sendToolResponse(response: GoogleGenAITypes.LiveSendToolResponseParameters): void;
    sendRealtimeInput(input: GoogleGenAITypes.LiveSendRealtimeInputParameters): false | void;
    getLiveSessionStatus(): {
        isActive: boolean;
        hasSession: boolean;
        isAvailable: boolean | typeof GoogleGenAITypes.Modality | undefined;
    };
    isLiveAvailable(): false | typeof GoogleGenAITypes.Modality | undefined;
    /**
     * In simulator mode, pop up a 2D UI to request Gemini key;
     * In XR mode, show a 3D UI to instruct users to get an API key.
     */
    triggerKeyPopup(): void;
    generate(prompt: string | string[], type?: 'image', systemInstruction?: string, model?: string): Promise<string | void | undefined>;
    /**
     * Create a sample keys.json file structure for reference
     * @returns Sample keys.json structure
     */
    static createSampleKeysStructure(): {
        gemini: {
            apiKey: string;
        };
        openai: {
            apiKey: string;
        };
    };
    /**
     * Check if the current model has an API key available from any source
     * @returns True if API key is available
     */
    hasApiKey(): Promise<boolean | "" | null>;
}
