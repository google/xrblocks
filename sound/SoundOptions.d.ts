export declare class SpeechSynthesizerOptions {
    enabled: boolean;
    /** If true, a new call to speak() will interrupt any ongoing speech. */
    allowInterruptions: boolean;
}
export declare class SpeechRecognizerOptions {
    enabled: boolean;
    /** Recognition language (e.g., 'en-US'). */
    lang: string;
    /** If true, recognition continues after a pause. */
    continuous: boolean;
    /** Keywords to detect as commands. */
    commands: string[];
    /** If true, provides interim results. */
    interimResults: boolean;
    /** Minimum confidence (0-1) for a command. */
    commandConfidenceThreshold: number;
    /** If true, play activation sounds in simulator. */
    playSimulatorActivationSounds: boolean;
}
export declare class SoundOptions {
    speechSynthesizer: SpeechSynthesizerOptions;
    speechRecognizer: SpeechRecognizerOptions;
}
