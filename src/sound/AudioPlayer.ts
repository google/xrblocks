import {Script} from '../core/Script.js';

export interface AudioPlayerOptions {
  sampleRate?: number;
  channelCount?: number;
}

export class AudioPlayer extends Script {
  private options: AudioPlayerOptions = {};
  private audioContext?: AudioContext;
  private audioQueue: AudioBuffer[] = [];
  private isPlaying = false;
  private nextStartTime = 0;

  constructor(options: AudioPlayerOptions = {}) {
    super();
    this.options = {sampleRate: 24000, channelCount: 1, ...options};
  }

  async initializeAudioContext() {
    if (!this.audioContext) {
      this.audioContext =
          new AudioContext({sampleRate: this.options.sampleRate});
      this.nextStartTime = this.audioContext.currentTime;
    }
  }

  async playAudioChunk(base64AudioData: string) {
    if (!base64AudioData) return;

    await this.initializeAudioContext();
    const arrayBuffer = this.base64ToArrayBuffer(base64AudioData);
    const audioBuffer = this.audioContext!.createBuffer(
        this.options.channelCount!, arrayBuffer.byteLength / 2,
        this.options.sampleRate!);

    const channelData = audioBuffer.getChannelData(0);
    const int16View = new Int16Array(arrayBuffer);

    for (let i = 0; i < int16View.length; i++) {
      channelData[i] = int16View[i] / 32768.0;
    }

    this.audioQueue.push(audioBuffer);
    if (!this.isPlaying) this.playNextAudioBuffer();
  }

  playNextAudioBuffer() {
    if (this.audioQueue.length === 0) {
      this.isPlaying = false;
      return;
    }

    this.isPlaying = true;
    const audioBuffer = this.audioQueue.shift()!;
    const currentTime = this.audioContext!.currentTime;
    const startTime = Math.max(this.nextStartTime, currentTime);

    const source = this.audioContext!.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(this.audioContext!.destination);
    source.onended = () => this.playNextAudioBuffer();
    source.start(startTime);
    this.nextStartTime = startTime + audioBuffer.duration;
  }

  clearQueue() {
    this.audioQueue = [];
    this.isPlaying = false;
  }

  getIsPlaying() {
    return this.isPlaying;
  }

  getQueueLength() {
    return this.audioQueue.length;
  }

  base64ToArrayBuffer(base64: string) {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }

  stop() {
    this.clearQueue();
    if (this.audioContext) {
      this.audioContext.close();
      this.audioContext = undefined;
    }
  }

  static isSupported() {
    return !!('AudioContext' in window || 'webkitAudioContext' in window);
  }

  dispose() {
    this.stop();
    super.dispose();
  }
}
