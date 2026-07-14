import * as THREE from 'three';
import {Script} from '../../core/Script';
import {WorldOptions} from '../WorldOptions';
import {AudioListener} from '../../sound/AudioListener';
import {MediaPipeDetectorBackend} from './backends/MediaPipeDetectorBackend';
import {BaseDetectorBackend} from './SoundDetectorBackend';
import {AudioClassifierResult} from './DetectedSounds';

const DEFAULT_SAMPLE_RATE = 44000;

interface SoundDetectorEventMap extends THREE.Object3DEventMap {
  soundDetected: {
    audioClassifierResult: AudioClassifierResult;
  };
}

/**
 * Detects and classifies sounds in the user's environment using a specified backend.
 * It queries an audio classifier model with the device mic input stream and returns
 * classifications over specific time intervals along with confidence scores.
 */
export class SoundDetector extends Script<SoundDetectorEventMap> {
  static dependencies = {options: WorldOptions};

  private _detectorBackends = new Map<string, Promise<BaseDetectorBackend>>();
  private audioListener?: AudioListener;
  private _isListening = false;

  get isListening(): boolean {
    return this._isListening;
  }

  // Injected dependencies
  private options?: WorldOptions;

  /**
   * Initializes the SoundDetector.
   */
  override async init({options}: {options: WorldOptions}) {
    this.options = options;
  }

  /**
   * Starts listening to the default mic input stream.
   */
  async startListening() {
    if (this._isListening) return;

    if (!this.audioListener) {
      this.audioListener = new AudioListener({
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      });
    }

    const sampleRate =
      this.audioListener?.audioContext?.sampleRate || DEFAULT_SAMPLE_RATE;
    const backend = await this.getOrCreateDetectorBackend(sampleRate);

    try {
      this._isListening = true;
      await this.audioListener.startCapture({
        onAudioData: async (buffer: ArrayBuffer) => {
          if (!backend) return;

          const normalizedAudio = backend.normalizeAudio(buffer);

          const audioClassifierResult = backend.classify(normalizedAudio);
          if (audioClassifierResult) {
            this.dispatchEvent({
              type: 'soundDetected',
              audioClassifierResult: audioClassifierResult,
            });
          }
        },
      });

      console.log('SoundDetector: Started listening using AudioListener.');
    } catch (error) {
      console.error(
        'SoundDetector: Failed to start audio classification:',
        error
      );
      this._isListening = false;
    }
  }

  /**
   * Stops listening and releases resources.
   */
  stopListening() {
    if (!this._isListening) return;
    this.audioListener?.stopCapture();
    this._isListening = false;
    console.log('SoundDetector: Stopped listening.');
  }

  override update(_timestamp: number, _frame?: XRFrame) {
    // No per-frame update logic needed, audio is handled asynchronously via streams.
  }

  override dispose() {
    this.stopListening();
    for (const backendPromise of this._detectorBackends.values()) {
      void backendPromise.then((backend) => backend.dispose()).catch(() => {});
    }
    this._detectorBackends.clear();
    this.audioListener = undefined;
  }

  private getOrCreateDetectorBackend(
    sampleRate: number
  ): Promise<BaseDetectorBackend> {
    if (!this.options) {
      throw new Error(
        'SoundDetector: Options not initialized. Call init first.'
      );
    }
    const activeBackend = this.options.sounds.backendConfig.activeBackend;

    let detectorBackendPromise = this._detectorBackends.get(activeBackend);
    if (!detectorBackendPromise) {
      detectorBackendPromise = (async () => {
        switch (activeBackend) {
          case 'mediapipe':
            return new MediaPipeDetectorBackend({
              options: this.options!,
              sampleRate,
            });
          default:
            throw new Error(
              `SoundDetector backend '${activeBackend}' is not supported.`
            );
        }
      })();
      this._detectorBackends.set(activeBackend, detectorBackendPromise);
    }
    return detectorBackendPromise;
  }
}
