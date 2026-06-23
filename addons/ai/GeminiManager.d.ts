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
    interrupted: object;
    close: object;
}
export declare class GeminiManager extends xb.Script<GeminiManagerEventMap> {
    xrDeviceCamera?: xb.XRDeviceCamera;
    ai: xb.AI;
    isAIRunning: boolean;
    private screenshotInterval?;
    currentInputText: string;
    currentOutputText: string;
    tools: xb.Tool[];
    cameraMimeType: string;
    cameraQuality: number;
    cameraWidth?: number;
    cameraHeight?: number;
    captureMode: 'screenshot' | 'camera';
    overlayScreenshotOnCamera: boolean;
    constructor();
    init(): void;
    startGeminiLive({ liveParams, model, tools, captureMode, overlayOnCamera, camera, }?: {
        liveParams?: GoogleGenAITypes.LiveConnectConfig;
        model?: string;
        /** Tools the model may call. Overrides {@link GeminiManager.tools}. */
        tools?: xb.Tool[];
        /**
         * What to stream each frame: `'screenshot'` (rendered virtual content) or
         * `'camera'` (raw passthrough frames). Defaults to
         * {@link GeminiManager.captureMode}.
         */
        captureMode?: 'screenshot' | 'camera';
        /** In screenshot mode, composite virtual content over the camera image. */
        overlayOnCamera?: boolean;
        /** Capture config used in `'camera'` mode. */
        camera?: {
            /** Frames per second sent to the model. Default `1`. */
            fps?: number;
            /** JPEG quality, 0..1. */
            quality?: number;
            /** Downscale width in pixels. Omit for full resolution. */
            width?: number;
            /** Downscale height in pixels. Omit for full resolution. */
            height?: number;
        };
    }): Promise<void>;
    stopGeminiLive(): Promise<void>;
    startLiveAI(params: GoogleGenAITypes.LiveConnectConfig, model?: string): Promise<void>;
    startScreenshotCapture(intervalMs?: number): void;
    captureAndSendScreenshot(): Promise<void>;
    sendVideoFrame(base64Image: string, mimeType?: string): void;
    cleanup(): void;
    handleAIMessage(message: GoogleGenAITypes.LiveServerMessage): void;
    dispose(): void;
}
