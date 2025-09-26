export interface GeminiLiveOptions {
    enabled?: boolean;
    model?: string;
    startOfSpeechSensitivity?: 'LOW' | 'HIGH';
    endOfSpeechSensitivity?: 'LOW' | 'HIGH';
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
export declare class GeminiOptions {
    apiKey: string;
    urlParam: string;
    keyValid: boolean;
    enabled: boolean;
    model: string;
    config: {};
    live: GeminiLiveOptions;
}
export declare class OpenAIOptions {
    apiKey: string;
    urlParam: string;
    model: string;
    enabled: boolean;
}
export type AIModel = 'gemini' | 'openai';
export declare class AIOptions {
    enabled: boolean;
    model: AIModel;
    gemini: GeminiOptions;
    openai: OpenAIOptions;
    globalUrlParams: {
        key: string;
    };
}
