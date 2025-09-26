import {AI} from '../ai/AI';
import {Registry} from '../core/components/Registry';
import {Script} from '../core/Script.js';

export interface AudioListenerOptions {
  sampleRate?: number;
  channelCount?: number;
  echoCancellation?: boolean;
  noiseSuppression?: boolean;
  autoGainControl?: boolean;
}

function arrayBufferToBase64(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export class AudioListener extends Script {
  static dependencies = {registry: Registry};
  private options: AudioListenerOptions;
  private audioStream?: MediaStream;
  private audioContext?: AudioContext;
  private sourceNode?: MediaStreamAudioSourceNode;
  private processorNode?: AudioWorkletNode;
  private isCapturing = false;
  private latestAudioBuffer: ArrayBuffer|null = null;
  private registry!: Registry;
  aiService?: AI;
  private onAudioData?: ((audioBuffer: ArrayBuffer) => void);
  private onError?: ((error: Error) => void);

  constructor(options: AudioListenerOptions = {}) {
    super();
    this.options = {
      sampleRate: 16000,
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      ...options
    };
  }

  /**
   * Init the AudioListener.
   */
  init({registry}: {registry: Registry;}) {
    this.registry = registry;
  }

  async startCapture(callbacks: {
    onAudioData?: (audioBuffer: ArrayBuffer) => void;
    onError?: (error: Error) => void;
  } = {}) {
    if (this.isCapturing) return;
    this.onAudioData = callbacks.onAudioData;
    this.onError = callbacks.onError;
    try {
      await this.setupAudioCapture();
      this.isCapturing = true;
    } catch (error) {
      console.error('Failed to start audio capture:', error);
      this.onError?.(error as Error);
      this.cleanup();
    }
  }

  stopCapture() {
    if (!this.isCapturing) return;
    this.cleanup();
    this.isCapturing = false;
  }

  async setupAudioCapture() {
    this.audioStream =
        await navigator.mediaDevices.getUserMedia({audio: true, video: false});

    const actualSampleRate =
        this.audioStream.getAudioTracks()[0].getSettings().sampleRate;
    this.audioContext = new AudioContext({sampleRate: actualSampleRate});
    await this.setupAudioWorklet();

    this.sourceNode =
        this.audioContext.createMediaStreamSource(this.audioStream);
    this.processorNode =
        new AudioWorkletNode(this.audioContext, 'audio-capture-processor');

    this.processorNode.port.onmessage = (event) => {
      if (event.data.type === 'audioData') {
        this.latestAudioBuffer = event.data.data;
        this.onAudioData?.(event.data.data);
        this.streamToAI(event.data.data);
      }
    };

    // Check if the AudioContext is running, resume if necessary
    if (this.audioContext.state === 'suspended') {
      await this.audioContext.resume();
    }

    this.sourceNode.connect(this.processorNode);
  }

  private async setupAudioWorklet() {
    const processorCode = `
      class AudioCaptureProcessor extends AudioWorkletProcessor {
        process(inputs, outputs, parameters) {
          const input = inputs[0];
          if (input && input[0]) {
            const inputData = input[0];
            const pcmData = new Int16Array(inputData.length);
            for (let i = 0; i < inputData.length; i++) {
              pcmData[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768));
            }
            this.port.postMessage({type: 'audioData', data: pcmData.buffer});
          }
          return true;
        }
      }
      registerProcessor('audio-capture-processor', AudioCaptureProcessor);
    `;

    const blob = new Blob([processorCode], {type: 'application/javascript'});
    const processorURL = URL.createObjectURL(blob);
    await this.audioContext!.audioWorklet.addModule(processorURL);
    URL.revokeObjectURL(processorURL);
  }

  streamToAI(audioBuffer: ArrayBuffer) {
    if (!this.aiService?.sendRealtimeInput) return;
    const base64Audio = arrayBufferToBase64(audioBuffer);
    const actualSampleRate =
        this.audioContext?.sampleRate || this.options.sampleRate;
    this.aiService.sendRealtimeInput({
      audio: {data: base64Audio, mimeType: `audio/pcm;rate=${actualSampleRate}`}
    });
  }

  setAIStreaming(enabled: boolean) {
    this.aiService = enabled ? this.registry.get(AI) : undefined;
  }

  cleanup() {
    this.processorNode?.disconnect();
    this.sourceNode?.disconnect();
    if (this.audioContext && this.audioContext.state !== 'closed') {
      this.audioContext.close();
    }
    this.audioStream?.getTracks().forEach(track => track.stop());
    this.processorNode = undefined;
    this.sourceNode = undefined;
    this.audioContext = undefined;
    this.audioStream = undefined;
    this.onAudioData = undefined;
    this.onError = undefined;
    this.latestAudioBuffer = null;
    this.aiService = undefined;
  }

  static isSupported() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  getIsCapturing() {
    return this.isCapturing;
  }

  getLatestAudioBuffer() {
    return this.latestAudioBuffer;
  }

  clearLatestAudioBuffer() {
    this.latestAudioBuffer = null;
  }

  dispose() {
    this.stopCapture();
    super.dispose();
  }
}
