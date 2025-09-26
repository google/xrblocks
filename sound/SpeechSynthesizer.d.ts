import { Script } from '../core/Script.js';
import { CategoryVolumes } from './CategoryVolumes.js';
import { SoundOptions } from './SoundOptions.js';
export declare class SpeechSynthesizer extends Script {
    private categoryVolumes;
    private onStartCallback;
    private onEndCallback;
    private onErrorCallback;
    static dependencies: {
        soundOptions: typeof SoundOptions;
    };
    private synth;
    private voices;
    private selectedVoice?;
    private isSpeaking;
    private debug;
    private specificVolume;
    private speechCategory;
    private options;
    constructor(categoryVolumes: CategoryVolumes, onStartCallback?: () => void, onEndCallback?: () => void, onErrorCallback?: (_: Error) => void);
    init({ soundOptions }: {
        soundOptions: SoundOptions;
    }): void;
    loadVoices(): void;
    setVolume(level: number): void;
    speak(text: string, lang?: string, pitch?: number, rate?: number): Promise<void>;
    tts(text: string, lang?: string, pitch?: number, rate?: number): void;
    cancel(): void;
    destroy(): void;
}
