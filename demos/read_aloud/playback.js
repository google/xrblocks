/**
 * Gapless playback of decoded audio buffers through the SDK's shared audio
 * listener, so master volume applies and no second AudioContext is created.
 */
export class ChunkPlayer {
  /** @param listener - `xb.core.sound.getAudioListener()` (a THREE.AudioListener). */
  constructor(listener) {
    this.listener = listener;
    this.context = listener.context;
    this.sources = new Set();
    this.cursor = null;
  }

  get playing() {
    return this.sources.size > 0;
  }

  /** Audio contexts start suspended until a user gesture; call before play. */
  async resume() {
    if (this.context.state === 'suspended') await this.context.resume();
  }

  /**
   * Schedules an AudioBuffer right after the previous one.
   * @returns The context time at which the buffer ends.
   */
  enqueue(buffer) {
    const source = this.context.createBufferSource();
    source.buffer = buffer;
    source.connect(this.listener.getInput());
    const at = Math.max(this.cursor ?? 0, this.context.currentTime + 0.05);
    source.onended = () => {
      this.sources.delete(source);
      if (!this.playing) this.cursor = null;
    };
    source.start(at);
    this.sources.add(source);
    this.cursor = at + buffer.duration;
    return this.cursor;
  }

  /** Resolves once everything queued so far has finished playing. */
  whenDone() {
    if (!this.playing) return Promise.resolve();
    const remaining = Math.max(0, this.cursor - this.context.currentTime);
    return new Promise((resolve) => setTimeout(resolve, remaining * 1000 + 50));
  }

  stop() {
    for (const source of this.sources) {
      source.onended = null;
      try {
        source.stop();
      } catch {
        // Already ended.
      }
    }
    this.sources.clear();
    this.cursor = null;
  }
}
