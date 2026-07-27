import type * as MEDIAPIPE from '@mediapipe/tasks-audio';
import {
  DetectorBackendContext,
  BaseDetectorBackend,
  NormalizedAudio,
} from '../SoundDetectorBackend';
import {AudioClassifierResult} from '../DetectedSounds';

let FilesetResolver: typeof MEDIAPIPE.FilesetResolver | undefined;
let AudioClassifier: typeof MEDIAPIPE.AudioClassifier | undefined;

// --- Attempt Dynamic Import ---
async function loadMediaPipeModule() {
  if (FilesetResolver && AudioClassifier) {
    return;
  }
  try {
    const mediapipeModule = await import('@mediapipe/tasks-audio');
    FilesetResolver = mediapipeModule.FilesetResolver;
    AudioClassifier = mediapipeModule.AudioClassifier;
    console.log("'@mediapipe/tasks-audio' module loaded successfully.");
  } catch (error) {
    console.error('Failed to load MediaPipe module:', error);
    throw error;
  }
}

export class MediaPipeDetectorBackend extends BaseDetectorBackend {
  private chunkSamples = 16000;
  private accumulatedAudio: number[] = [];

  private audioClassifier: MEDIAPIPE.AudioClassifier | null = null;

  constructor(context: DetectorBackendContext) {
    super(context);
    const mediapipeConfig = this.context.options.sounds.backendConfig.mediapipe;
    this.chunkSamples = mediapipeConfig.chunkSamples;

    this.tryInitializeAudioClassifier();
  }

  private async tryInitializeAudioClassifier(): Promise<void> {
    if (this.audioClassifier) return;

    await loadMediaPipeModule();

    const mediapipeConfig = this.context.options.sounds.backendConfig.mediapipe;
    const audioTasks = await FilesetResolver!.forAudioTasks(
      mediapipeConfig.wasmFilesUrl
    );
    this.audioClassifier = await AudioClassifier!.createFromOptions(
      audioTasks,
      {
        baseOptions: {modelAssetPath: mediapipeConfig.modelAssetPath},
      }
    );
  }

  /**
   * Normalizes audio data received as an ArrayBuffer (containing Int16 samples)
   * into a Float32Array with values in the range [-1.0, 1.0] that the MediaPipe
   * classifier can understand.
   * @param arrayBuffer - The raw audio data buffer.
   * @returns The normalized audio data.
   */
  override normalizeAudio(arrayBuffer: ArrayBuffer): NormalizedAudio {
    const int16Data = new Int16Array(arrayBuffer);
    const normalizedAudio = new Float32Array(int16Data.length);
    for (let i = 0; i < int16Data.length; i++) {
      normalizedAudio[i] = int16Data[i] / 32768.0;
    }
    return {data: normalizedAudio};
  }

  override classify(audio: NormalizedAudio): AudioClassifierResult | null {
    if (!this.audioClassifier) return null;

    const audioData = audio.data;
    for (let i = 0; i < audioData.length; i++) {
      this.accumulatedAudio.push(audioData[i]);
    }

    // chunkSamples is required because the MediaPipe AudioClassifier operates on
    // discrete chunks of audio data. We accumulate samples until we reach this
    // threshold before performing classification. If we do not accumulate enough samples,
    // the MediaPipe AudioClassifier returns a classification of "Silence" which is not
    // useful.
    if (this.accumulatedAudio.length >= this.chunkSamples) {
      const chunk = new Float32Array(
        this.accumulatedAudio.slice(0, this.chunkSamples)
      );
      this.accumulatedAudio = this.accumulatedAudio.slice(this.chunkSamples); // simple non-overlapping window

      const mediaPipeResult = this.audioClassifier.classify(
        chunk,
        this.context.sampleRate
      );

      const debugData = this.context.options.sounds.showDebugInfo
        ? this.populateDebugData({data: chunk})
        : undefined;

      return {
        items: mediaPipeResult,
        debug: debugData,
      };
    }
    return null;
  }

  override dispose() {
    this.audioClassifier?.close();
    this.audioClassifier = null;
    this.accumulatedAudio = [];
  }
}
