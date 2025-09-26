import * as THREE from 'three';
import { Script } from '../core/Script.js';
import { SoundOptions, SpeechRecognizerOptions } from './SoundOptions.js';
import { SoundSynthesizer } from './SoundSynthesizer.js';
interface SpeechRecognizerEventMap extends THREE.Object3DEventMap {
    start: object;
    error: {
        error: string;
    };
    end: object;
    result: {
        originalEvent: SpeechRecognitionEvent;
        transcript: string;
        confidence: number;
        command?: string;
        isFinal: boolean;
    };
}
export declare class SpeechRecognizer extends Script<SpeechRecognizerEventMap> {
    private soundSynthesizer;
    static dependencies: {
        soundOptions: typeof SoundOptions;
    };
    options: SpeechRecognizerOptions;
    recognition?: SpeechRecognition;
    isListening: boolean;
    lastTranscript: string;
    lastCommand?: string;
    lastConfidence: number;
    error?: string;
    playActivationSounds: boolean;
    private handleStartBound;
    private handleResultBound;
    private handleEndBound;
    private handleErrorBound;
    constructor(soundSynthesizer: SoundSynthesizer);
    init({ soundOptions }: {
        soundOptions: SoundOptions;
    }): void;
    onSimulatorStarted(): void;
    start(): void;
    stop(): void;
    getLastTranscript(): string;
    getLastCommand(): string | undefined;
    getLastConfidence(): number;
    private _handleStart;
    private _handleResult;
    _handleEnd(): void;
    _handleError(event: SpeechRecognitionErrorEvent): void;
    destroy(): void;
}
export {};
