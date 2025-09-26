import type * as GoogleGenAITypes from '@google/genai';
import * as THREE from 'three';
import * as xb from 'xrblocks';
export interface GeminiManagerEventMap extends THREE.Object3DEventMap {
    inputTranscription: {
        message: string;
    };
    outputTranscription: {
        message: string;
    };
    turnComplete: object;
}
export declare class GeminiManager extends xb.Script<GeminiManagerEventMap> {
    xrDeviceCamera?: xb.XRDeviceCamera;
    ai: xb.AI;
    audioStream: MediaStream | null;
    audioContext: AudioContext | null;
    sourceNode: MediaStreamAudioSourceNode | null;
    processorNode: AudioWorkletNode | null;
    isAIRunning: boolean;
    audioQueue: AudioBuffer[];
    isPlayingAudio: boolean;
    private screenshotInterval?;
    currentInputText: string;
    currentOutputText: string;
    constructor();
    init(): void;
    startGeminiLive(): Promise<void>;
    stopGeminiLive(): Promise<void>;
    setupAudioCapture(): Promise<void>;
    startLiveAI(): Promise<void>;
    startScreenshotCapture(intervalMs?: number): void;
    captureAndSendScreenshot(): void;
    sendAudioData(audioBuffer: ArrayBuffer): void;
    sendVideoFrame(base64Image: string): void;
    initializeAudioContext(): Promise<void>;
    playAudioChunk(audioData: string): Promise<void>;
    playNextAudioBuffer(): void;
    cleanup(): void;
    handleAIMessage(message: GoogleGenAITypes.LiveServerMessage): void;
    arrayBufferToBase64(buffer: ArrayBuffer): string;
    base64ToArrayBuffer(base64: string): ArrayBuffer;
    dispose(): void;
}
