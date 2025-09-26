import { Script } from '../core/Script.js';
/**
 * Defines common UI sound presets with their default parameters.
 * Each preset specifies frequency, duration, and waveform type.
 */
export declare const SOUND_PRESETS: {
    readonly BEEP: {
        readonly frequency: 1000;
        readonly duration: 0.07;
        readonly waveformType: "sine";
    };
    readonly CLICK: readonly [{
        readonly frequency: 1500;
        readonly duration: 0.02;
        readonly waveformType: "triangle";
        readonly delay: 0;
    }];
    readonly ACTIVATE: readonly [{
        readonly frequency: 800;
        readonly duration: 0.05;
        readonly waveformType: "sine";
        readonly delay: 0;
    }, {
        readonly frequency: 1200;
        readonly duration: 0.07;
        readonly waveformType: "sine";
        readonly delay: 50;
    }];
    readonly DEACTIVATE: readonly [{
        readonly frequency: 1200;
        readonly duration: 0.05;
        readonly waveformType: "sine";
        readonly delay: 0;
    }, {
        readonly frequency: 800;
        readonly duration: 0.07;
        readonly waveformType: "sine";
        readonly delay: 50;
    }];
};
export declare class SoundSynthesizer extends Script {
    audioContext?: AudioContext;
    isInitialized: boolean;
    debug: boolean;
    /**
     * Initializes the AudioContext.
     */
    private _initAudioContext;
    /**
     * Plays a single tone with specified parameters.
     * @param frequency - The frequency of the tone in Hz.
     * @param duration - The duration of the tone in seconds.
     * @param volume - The volume of the tone (0.0 to 1.0).
     * @param waveformType - The type of waveform ('sine', 'square', 'sawtooth',
     *     'triangle').
     */
    playTone(frequency: number, duration: number, volume: number, waveformType: OscillatorType): void;
    /**
     * Plays a predefined sound preset.
     * @param presetName - The name of the preset (e.g., 'BEEP', 'CLICK',
     *     'ACTIVATE', 'DEACTIVATE').
     * @param volume - The volume for the preset (overrides default
     *     if present, otherwise uses this).
     */
    playPresetTone(presetName: keyof typeof SOUND_PRESETS, volume?: number): void;
}
