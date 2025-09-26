import {Script} from '../core/Script.js';

interface SoundPresetTone {
  frequency: number;
  duration: number;
  waveformType: OscillatorType;
  delay?: number;
}

/**
 * Defines common UI sound presets with their default parameters.
 * Each preset specifies frequency, duration, and waveform type.
 */
export const SOUND_PRESETS = {
  BEEP: {frequency: 1000, duration: 0.07, waveformType: 'sine'},
  CLICK: [
    {frequency: 1500, duration: 0.02, waveformType: 'triangle', delay: 0},
  ],
  ACTIVATE: [
    {frequency: 800, duration: 0.05, waveformType: 'sine', delay: 0},
    {frequency: 1200, duration: 0.07, waveformType: 'sine', delay: 50}
  ],
  DEACTIVATE: [
    {frequency: 1200, duration: 0.05, waveformType: 'sine', delay: 0},
    {frequency: 800, duration: 0.07, waveformType: 'sine', delay: 50}
  ]
} as const;

export class SoundSynthesizer extends Script {
  audioContext?: AudioContext;
  isInitialized = false;
  debug = false;

  /**
   * Initializes the AudioContext.
   */
  private _initAudioContext() {
    if (!this.isInitialized) {
      this.audioContext = new AudioContext();
      this.isInitialized = true;
      if (this.debug) {
        console.log('SoundSynthesizer: AudioContext initialized.');
      }
    }
  }

  /**
   * Plays a single tone with specified parameters.
   * @param frequency - The frequency of the tone in Hz.
   * @param duration - The duration of the tone in seconds.
   * @param volume - The volume of the tone (0.0 to 1.0).
   * @param waveformType - The type of waveform ('sine', 'square', 'sawtooth',
   *     'triangle').
   */
  playTone(
      frequency: number, duration: number, volume: number,
      waveformType: OscillatorType) {
    this._initAudioContext();  // Initialize context on first interaction

    if (!this.audioContext) {
      console.error(
          'SoundSynthesizer: AudioContext not available. Cannot play tone.');
      return;
    }

    const oscillator = this.audioContext.createOscillator();
    oscillator.type = waveformType;
    oscillator.frequency.setValueAtTime(
        frequency, this.audioContext.currentTime);
    const gainNode = this.audioContext.createGain();
    gainNode.gain.setValueAtTime(volume, this.audioContext.currentTime);
    oscillator.connect(gainNode);
    gainNode.connect(this.audioContext.destination);
    oscillator.start();

    // Stop the sound after the specified duration with a slight fade out to
    // prevent clicks
    const stopTime = this.audioContext.currentTime + duration;
    const fadeOutTime = Math.max(
        0.01, duration * 0.1);  // Fade out over 10% of duration, min 0.01s

    gainNode.gain.exponentialRampToValueAtTime(0.00001, stopTime - fadeOutTime);
    oscillator.stop(stopTime);
  }

  /**
   * Plays a predefined sound preset.
   * @param presetName - The name of the preset (e.g., 'BEEP', 'CLICK',
   *     'ACTIVATE', 'DEACTIVATE').
   * @param volume - The volume for the preset (overrides default
   *     if present, otherwise uses this).
   */
  playPresetTone(presetName: keyof typeof SOUND_PRESETS, volume = 0.5) {
    const preset = SOUND_PRESETS[presetName];

    if (!preset) {
      console.warn(`SoundSynthesizer: Preset '${presetName}' not found.`);
      return;
    }

    // Handle single tone presets
    if (!Array.isArray(preset)) {
      const tone = preset as SoundPresetTone;
      this.playTone(tone.frequency, tone.duration, volume, tone.waveformType);
    } else {
      // Handle multi-tone sequences
      preset.forEach(toneConfig => {
        setTimeout(() => {
          this.playTone(
              toneConfig.frequency, toneConfig.duration, volume,
              toneConfig.waveformType);
        }, toneConfig.delay || 0);
      });
    }
  }
}
