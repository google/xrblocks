export class SpeechSynthesizerOptions {
  enabled = false;
  /** If true, a new call to speak() will interrupt any ongoing speech. */
  allowInterruptions = false;
}

export class SpeechRecognizerOptions {
  enabled = true;
  /** Recognition language (e.g., 'en-US'). */
  lang = 'en-US';
  /** If true, recognition continues after a pause. */
  continuous = false;
  /** Keywords to detect as commands. */
  commands: string[] = [];
  /** If true, provides interim results. */
  interimResults = false;
  /** Minimum confidence (0-1) for a command. */
  commandConfidenceThreshold = 0.7;
  /** If true, play activation sounds in simulator. */
  playSimulatorActivationSounds = true;
}

export class SoundOptions {
  speechSynthesizer = new SpeechSynthesizerOptions();
  speechRecognizer = new SpeechRecognizerOptions();
}
