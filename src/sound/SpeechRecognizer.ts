import * as THREE from 'three';

import {Script} from '../core/Script.js';

import {SoundOptions, SpeechRecognizerOptions} from './SoundOptions.js';
import {SoundSynthesizer} from './SoundSynthesizer.js';

type WindowWithSpeechRecognition = Window&typeof globalThis&{
  SpeechRecognition?: SpeechRecognition;
  webkitSpeechRecognition?: SpeechRecognition;
};

interface SpeechRecognizerEventMap extends THREE.Object3DEventMap {
  start: object;
  error: {error: string};
  end: object;
  result: {
    originalEvent: SpeechRecognitionEvent; transcript: string;
    confidence: number;
    command?: string; isFinal: boolean;
  };
}

export class SpeechRecognizer extends Script<SpeechRecognizerEventMap> {
  static dependencies = {soundOptions: SoundOptions};

  options!: SpeechRecognizerOptions;
  recognition?: SpeechRecognition;
  isListening = false;
  lastTranscript = '';
  lastCommand?: string;
  lastConfidence = 0;
  error?: string;
  playActivationSounds = false;

  private handleStartBound = this._handleStart.bind(this);
  private handleResultBound = this._handleResult.bind(this);
  private handleEndBound = this._handleEnd.bind(this);
  private handleErrorBound = this._handleError.bind(this);

  constructor(private soundSynthesizer: SoundSynthesizer) {
    super();
  }

  override init({soundOptions}: {soundOptions: SoundOptions}) {
    this.options = soundOptions.speechRecognizer;
    const SpeechRecognitionAPI =
        (window as WindowWithSpeechRecognition).SpeechRecognition ||
        (window as WindowWithSpeechRecognition).webkitSpeechRecognition;
    if (!SpeechRecognitionAPI) {
      console.warn(
          'SpeechRecognizer: Speech Recognition API not supported in this browser.');
      this.error = 'API not supported';
      return;
    }

    this.recognition = new SpeechRecognitionAPI();
    this.recognition.lang = this.options.lang;
    this.recognition.continuous = this.options.continuous;
    this.recognition.interimResults = this.options.interimResults;

    // Setup native event listeners
    this.recognition.onstart = this.handleStartBound;
    this.recognition.onresult = this.handleResultBound;
    this.recognition.onend = this.handleEndBound;
    this.recognition.onerror = this.handleErrorBound;
  }

  onSimulatorStarted() {
    this.playActivationSounds = this.options.playSimulatorActivationSounds;
  }

  start() {
    if (!this.recognition) {
      console.error('SpeechRecognizer: Not initialized.');
      return;
    }
    if (this.isListening) {
      console.warn('SpeechRecognizer: Already listening.');
      return;
    }
    try {
      this.lastTranscript = '';
      this.lastCommand = undefined;
      this.lastConfidence = 0;
      this.error = undefined;
      this.recognition.start();
      this.isListening = true;
      console.debug('SpeechRecognizer: Listening started.');
    } catch (e: unknown) {
      console.error('SpeechRecognizer: Error starting recognition:', e);
      this.error = (e as Partial<Error>).message || 'Start failed';
      this.isListening = false;
      this.dispatchEvent({type: 'error', error: this.error!});
    }
  }

  stop() {
    if (!this.recognition || !this.isListening) {
      return;
    }
    try {
      this.recognition.stop();
      console.debug('SpeechRecognizer: Stop requested.');
    } catch (e) {
      console.error('SpeechRecognizer: Error stopping recognition:', e);
      this.error = (e as Partial<Error>).message || 'Stop failed';
      this.isListening = false;
    }
  }

  getLastTranscript() {
    return this.lastTranscript;
  }

  getLastCommand() {
    return this.lastCommand;
  }

  getLastConfidence() {
    return this.lastConfidence;
  }

  // Private handler for the 'start' event
  private _handleStart() {
    console.debug('SpeechRecognizer: Listening started.');
    this.dispatchEvent({type: 'start'});
    if (this.playActivationSounds) {
      this.soundSynthesizer.playPresetTone('ACTIVATE');
    }
  }

  // Private handler for the 'result' event
  private _handleResult(event: SpeechRecognitionEvent) {
    let interimTranscript = '';
    let finalTranscript = '';
    let currentConfidence = 0;

    for (let i = event.resultIndex; i < event.results.length; ++i) {
      const result = event.results[i];
      const transcript = result[0].transcript;
      if (result.isFinal) {
        finalTranscript += transcript;
        currentConfidence = result[0].confidence;
      } else {
        interimTranscript += transcript;
      }
    }

    this.lastTranscript = finalTranscript.trim() || interimTranscript.trim();
    this.lastConfidence = currentConfidence;
    this.lastCommand = undefined;

    if (finalTranscript && this.options.commands.length > 0) {
      const upperTranscript = finalTranscript.trim().toUpperCase();
      for (const command of this.options.commands) {
        if (upperTranscript.includes(command.toUpperCase()) &&
            this.lastConfidence >= this.options.commandConfidenceThreshold) {
          this.lastCommand = command;
          console.debug(
              `SpeechRecognizer Detected Command: ${this.lastCommand}`);
          break;
        }
      }
    }

    // Dispatch a 'result' event with all the relevant data
    this.dispatchEvent({
      type: 'result',
      originalEvent: event,
      transcript: this.lastTranscript,
      confidence: this.lastConfidence,
      command: this.lastCommand,
      isFinal: !!finalTranscript
    });
  }

  // Private handler for the 'end' event (e.g., when silence is detected)
  _handleEnd() {
    this.isListening = false;
    this.dispatchEvent({type: 'end'});

    if (this.options.continuous && this.error !== 'aborted' &&
        this.error !== 'no-speech') {
      console.debug('SpeechRecognizer: Restarting continuous listening...');
      setTimeout(() => this.start(), 100);
    } else if (this.playActivationSounds) {
      this.soundSynthesizer.playPresetTone('DEACTIVATE');
    }
  }

  // Private handler for the 'error' event
  _handleError(event: SpeechRecognitionErrorEvent) {
    console.error('SpeechRecognizer: Error:', event.error);
    this.error = event.error;
    this.isListening = false;
    this.dispatchEvent({type: 'error', error: event.error});
  }

  destroy() {
    this.stop();
    if (this.recognition) {
      this.recognition.onstart = null;
      this.recognition.onresult = null;
      this.recognition.onend = null;
      this.recognition.onerror = null;
      this.recognition = undefined;
    }
  }
}
