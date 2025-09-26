import { Script } from '../core/Script.js';
export interface AudioPlayerOptions {
    sampleRate?: number;
    channelCount?: number;
}
export declare class AudioPlayer extends Script {
    private options;
    private audioContext?;
    private audioQueue;
    private isPlaying;
    private nextStartTime;
    constructor(options?: AudioPlayerOptions);
    initializeAudioContext(): Promise<void>;
    playAudioChunk(base64AudioData: string): Promise<void>;
    playNextAudioBuffer(): void;
    clearQueue(): void;
    getIsPlaying(): boolean;
    getQueueLength(): number;
    base64ToArrayBuffer(base64: string): ArrayBuffer;
    stop(): void;
    static isSupported(): boolean;
    dispose(): void;
}
