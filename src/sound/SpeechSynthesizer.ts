import * as THREE from 'three';

import {Script} from '../core/Script.js';

import {CategoryVolumes} from './CategoryVolumes.js';
import {SoundOptions, SpeechSynthesizerOptions} from './SoundOptions.js';

export class SpeechSynthesizer extends Script {
  static dependencies = {soundOptions: SoundOptions};

  private synth = window.speechSynthesis;
  private voices: SpeechSynthesisVoice[] = [];
  private selectedVoice?: SpeechSynthesisVoice;
  private isSpeaking = false;
  private debug = false;
  private specificVolume = 1.0;
  private speechCategory = 'speech';
  private options!: SpeechSynthesizerOptions;

  constructor(
      private categoryVolumes: CategoryVolumes,
      private onStartCallback = () => {}, private onEndCallback = () => {},
      private onErrorCallback = (_: Error) => {}) {
    super();

    if (!this.synth) {
      console.error('SpeechSynthesizer: Speech Synthesis API not supported.');
    } else {
      this.loadVoices();
      if (this.synth.onvoiceschanged !== undefined) {
        this.synth.onvoiceschanged = this.loadVoices.bind(this);
      }
    }
    if (!this.categoryVolumes && this.synth) {
      console.warn(
          'SpeechSynthesizer: CategoryVolumes not found. Volume control will use specificVolume only.');
    }
  }

  init({soundOptions}: {soundOptions: SoundOptions}) {
    this.options = soundOptions.speechSynthesizer;
    if (this.debug) {
      console.log('SpeechSynthesizer initialized.');
    }
  }

  loadVoices() {
    if (!this.synth) return;
    this.voices = this.synth.getVoices();
    if (this.debug) {
      console.log('SpeechSynthesizer: Voices loaded:', this.voices.length);
    }
    this.selectedVoice = this.voices.find(
                             voice => voice.name.includes('Google') &&
                                 voice.lang.startsWith('en')) ||
        this.voices.find(voice => voice.lang.startsWith('en'));
    if (this.selectedVoice) {
      if (this.debug) {
        console.log(
            'SpeechSynthesizer: Selected voice:', this.selectedVoice.name);
      }
    } else {
      console.warn('SpeechSynthesizer: No suitable default voice found.');
    }
  }

  setVolume(level: number) {
    this.specificVolume = THREE.MathUtils.clamp(level, 0.0, 1.0);
    console.log(
        `SpeechSynthesizer specific volume set to: ${this.specificVolume}`);
  }

  speak(text: string, lang = 'en-US', pitch = 1.0, rate = 1.0) {
    return new Promise<void>((resolve, reject) => {
      if (!this.synth) {
        console.warn('SpeechSynthesizer: Cannot speak. API not supported.');
        return reject(new Error('Speech Synthesis API not supported.'));
      }

      if (this.isSpeaking) {
        if (this.options.allowInterruptions) {
          console.warn(
              'SpeechSynthesizer: Already speaking. Interrupting current speech.');
          this.cancel();
        } else {
          const errorMsg =
              'Already speaking and interruptions are not allowed.';
          console.warn(`SpeechSynthesizer: ${errorMsg}`);
          return reject(new Error(errorMsg));
        }
      }

      const utterance = new SpeechSynthesisUtterance(text);

      utterance.onstart = () => {
        this.isSpeaking = true;
        console.log('SpeechSynthesizer: Speaking started.');
        if (this.onStartCallback) this.onStartCallback();
      };

      utterance.onend = () => {
        this.isSpeaking = false;
        console.log('SpeechSynthesizer: Speaking ended.');
        if (this.onEndCallback) this.onEndCallback();
        resolve();
      };

      utterance.onerror = (event) => {
        if (this.options.allowInterruptions &&
            (event.error === 'interrupted' || event.error === 'canceled')) {
          console.warn(`SpeechSynthesizer: Speech utterance interrupted: ${
              event.error}`);
          return;
        }

        // For all other errors, reject the promise.
        console.error('SpeechSynthesizer: Error occurred:', event.error);
        this.isSpeaking = false;
        this.onErrorCallback(
            new Error(`Speech synthesis error code ${event.error}`));
        reject(event.error);
      };

      // Find a suitable voice if not already selected or if lang changed
      let voice = this.selectedVoice;
      if (!voice || !voice.lang.startsWith(lang.substring(0, 2))) {
        voice = this.voices.find(
                    v => v.lang === lang && v.name.includes('Google')) ||
            this.voices.find(
                v => v.lang.startsWith(lang.substring(0, 2)) &&
                    v.name.includes('Google')) ||
            this.voices.find(v => v.lang === lang) ||
            this.voices.find(v => v.lang.startsWith(lang.substring(0, 2)));
      }

      if (voice) {
        utterance.voice = voice;
        console.log(
            `SpeechSynthesizer: Using voice: ${voice.name} for lang ${lang}`);
      } else {
        utterance.lang = lang;
        console.warn(`SpeechSynthesizer: No specific voice found for lang ${
            lang}. Using browser default.`);
      }

      utterance.pitch = THREE.MathUtils.clamp(pitch, 0, 2);
      utterance.rate = THREE.MathUtils.clamp(rate, 0.1, 10);

      let effectiveVolume = this.specificVolume;
      if (this.categoryVolumes) {
        effectiveVolume = this.categoryVolumes.getEffectiveVolume(
            this.speechCategory, this.specificVolume);
      } else {
        effectiveVolume = THREE.MathUtils.clamp(this.specificVolume, 0.0, 1.0);
      }
      utterance.volume = effectiveVolume;
      console.log(
          `SpeechSynthesizer: Setting utterance volume to ${effectiveVolume}`);

      this.synth.speak(utterance);
    });
  }

  tts(text: string, lang?: string, pitch?: number, rate?: number) {
    this.speak(text, lang, pitch, rate);
  }

  cancel() {
    if (this.synth && this.synth.speaking) {
      this.synth.cancel();
      this.isSpeaking = false;
      console.log('SpeechSynthesizer: Speech cancelled.');
    }
  }

  destroy() {
    this.cancel();
    if (this.synth && this.synth.onvoiceschanged !== undefined) {
      this.synth.onvoiceschanged = null;
    }
    this.voices = [];
    console.log('SpeechSynthesizer destroyed.');
  }
}
