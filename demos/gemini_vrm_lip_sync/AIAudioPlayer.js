/**
 * AIAudioPlayer.js
 *
 * Self-contained player for Gemini Live's streamed PCM audio that ALSO exposes
 * the audio as a `MediaStream`, so the lipsync add-on (`LipsyncMouth`) can analyse
 * exactly what the user hears.
 *
 * Gemini Live delivers base64-encoded 16-bit little-endian PCM at 24 kHz in each
 * `onmessage` (`message.data`). The core `xb.core.sound.playAIAudio()` path plays
 * this into an internal WebAudio graph we can't tap, so this class re-implements
 * the same Int16→AudioBuffer decode + look-ahead scheduling (mirroring
 * src/sound/AudioPlayer.ts) and fans each buffer out to:
 *   - `ctx.destination`  (the user hears Gemini), and
 *   - a `MediaStreamAudioDestinationNode` (`.stream` feeds LipsyncMouth).
 *
 * The caller owns the lifecycle: construct on session start, `playChunk()` per
 * message, `stop()` on session end.
 */

const SAMPLE_RATE = 24000; // Gemini Live output rate.
const SCHEDULE_AHEAD_TIME = 1.0; // seconds, matches core AudioPlayer.

export class AIAudioPlayer {
  constructor() {
    // Some browsers refuse a 24 kHz context. Fall back to the default rate and
    // resample on playback (AudioBuffer is still authored at 24 kHz below).
    try {
      this._ctx = new AudioContext({sampleRate: SAMPLE_RATE});
    } catch {
      this._ctx = new AudioContext();
    }

    this._gain = this._ctx.createGain();
    this._gain.connect(this._ctx.destination);

    // The tap that LipsyncMouth analyses.
    this._streamDest = this._ctx.createMediaStreamDestination();
    this._gain.connect(this._streamDest);

    this._queue = [];
    this._nextStartTime = this._ctx.currentTime;
  }

  /** The MediaStream carrying Gemini's voice (for LipsyncMouth). */
  get stream() {
    return this._streamDest.stream;
  }

  /** The shared AudioContext (pass to LipsyncMouth to avoid extra contexts). */
  get context() {
    return this._ctx;
  }

  /** Resume the context after a user gesture (browsers start it suspended). */
  async resume() {
    if (this._ctx.state === 'suspended') {
      await this._ctx.resume();
    }
  }

  /**
   * Decodes one base64 PCM chunk from Gemini Live and queues it for playback.
   * @param {string} base64AudioData base64 16-bit LE PCM at 24 kHz.
   */
  playChunk(base64AudioData) {
    if (!base64AudioData) return;

    const arrayBuffer = this._base64ToArrayBuffer(base64AudioData);
    const int16View = new Int16Array(arrayBuffer);

    const audioBuffer = this._ctx.createBuffer(
      1,
      int16View.length,
      SAMPLE_RATE
    );
    const channelData = audioBuffer.getChannelData(0);
    for (let i = 0; i < int16View.length; i++) {
      channelData[i] = int16View[i] / 32768.0;
    }

    this._queue.push(audioBuffer);
    this._scheduleBuffers();
  }

  _scheduleBuffers() {
    if (!this._ctx) return;
    while (
      this._queue.length > 0 &&
      this._nextStartTime <= this._ctx.currentTime + SCHEDULE_AHEAD_TIME
    ) {
      const audioBuffer = this._queue.shift();
      const startTime = Math.max(this._nextStartTime, this._ctx.currentTime);

      const source = this._ctx.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(this._gain);
      source.onended = () => this._scheduleBuffers();
      source.start(startTime);

      this._nextStartTime = startTime + audioBuffer.duration;
    }
  }

  /** Drops any audio still queued (e.g. on barge-in / stop). */
  clearQueue() {
    this._queue = [];
  }

  /** Closes the context and releases the stream. One-shot; rebuild to reuse. */
  stop() {
    this.clearQueue();
    if (this._ctx) {
      void this._ctx.close?.().catch(() => undefined);
      this._ctx = undefined;
    }
  }

  _base64ToArrayBuffer(base64) {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes.buffer;
  }
}
