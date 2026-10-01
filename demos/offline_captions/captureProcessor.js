/* global AudioWorkletProcessor, registerProcessor */
const CHUNK_FRAMES = 2048;

/** Downmixes microphone input and posts transferred mono chunks. */
class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.buffer = new Float32Array(CHUNK_FRAMES);
    this.length = 0;
  }

  process(inputs) {
    const channels = inputs[0];
    if (!channels?.length) return true;
    const frames = channels[0].length;
    for (let i = 0; i < frames; i++) {
      let sum = 0;
      for (const channel of channels) sum += channel[i];
      this.buffer[this.length++] = sum / channels.length;
      if (this.length === CHUNK_FRAMES) {
        this.port.postMessage(this.buffer, [this.buffer.buffer]);
        this.buffer = new Float32Array(CHUNK_FRAMES);
        this.length = 0;
      }
    }
    return true;
  }
}

registerProcessor('offline-captions-capture', CaptureProcessor);
