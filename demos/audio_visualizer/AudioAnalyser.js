/**
 * AudioAnalyser — reusable Web Audio API wrapper.
 *
 * Wraps AudioContext + AnalyserNode + getUserMedia into a clean interface
 * that any demo can import and use without touching the Web Audio API directly.
 *
 * Usage:
 *   const analyser = new AudioAnalyser({ fftSize: 128, smoothing: 0.8 });
 *   await analyser.start();          // requests mic permission
 *   analyser.getFrequencyData();     // → Uint8Array, length = fftSize / 2
 *   analyser.getWaveformData();      // → Uint8Array, length = fftSize / 2
 *   analyser.getRMS();               // → 0–1 overall loudness
 *   analyser.isBeat();               // → true on detected bass beat
 *   analyser.stop();
 */
export class AudioAnalyser {
  /**
   * @param {object} options
   * @param {number} [options.fftSize=128]        FFT size (power of 2, ≥ 32).
   * @param {number} [options.smoothing=0.8]      AnalyserNode smoothingTimeConstant.
   * @param {number} [options.beatThreshold=1.4]  Bass EMA multiplier that triggers a beat.
   * @param {number} [options.beatCooldownMs=200] Min ms between beat events.
   * @param {number} [options.bassRatio=0.15]     Fraction of bins treated as "bass".
   */
  constructor({
    fftSize = 128,
    smoothing = 0.8,
    beatThreshold = 1.4,
    beatCooldownMs = 200,
    bassRatio = 0.15,
  } = {}) {
    this._fftSize = fftSize;
    this._smoothing = smoothing;
    this._beatThreshold = beatThreshold;
    this._beatCooldownMs = beatCooldownMs;
    this._bassRatio = bassRatio;

    this._audioCtx = null;
    this._analyserNode = null;
    this._stream = null;
    this._freqData = null;
    this._waveData = null;

    // Beat detection state
    this._bassEma = 0;
    this._lastBeatTime = -Infinity;
    this._beatActive = false;
  }

  // ─── Public API ────────────────────────────────────────────────────────────

  /** True while mic is connected and AudioContext is running. */
  get isListening() {
    return this._analyserNode !== null;
  }

  /**
   * Requests microphone permission and starts audio analysis.
   * @returns {Promise<void>} Resolves on success, rejects if permission denied.
   */
  async start() {
    const stream = await navigator.mediaDevices.getUserMedia({audio: true});
    this._stream = stream;

    this._audioCtx = new AudioContext();
    const source = this._audioCtx.createMediaStreamSource(stream);

    this._analyserNode = this._audioCtx.createAnalyser();
    this._analyserNode.fftSize = this._fftSize;
    this._analyserNode.smoothingTimeConstant = this._smoothing;

    source.connect(this._analyserNode);

    const binCount = this._analyserNode.frequencyBinCount;
    this._freqData = new Uint8Array(binCount);
    this._waveData = new Uint8Array(binCount);
  }

  /** Stops microphone capture and closes AudioContext. */
  stop() {
    if (this._stream) {
      this._stream.getTracks().forEach((t) => t.stop());
      this._stream = null;
    }
    if (this._audioCtx) {
      this._audioCtx.close();
      this._audioCtx = null;
    }
    this._analyserNode = null;
    this._freqData = null;
    this._waveData = null;
    this._bassEma = 0;
    this._beatActive = false;
  }

  /**
   * Returns the latest frequency-domain data (0–255 per bin).
   * Call once per frame; the returned array is reused each call.
   * @returns {Uint8Array|null} null when not listening.
   */
  getFrequencyData() {
    if (!this._analyserNode) return null;
    this._analyserNode.getByteFrequencyData(this._freqData);
    return this._freqData;
  }

  /**
   * Returns the latest time-domain waveform data (0–255 per sample).
   * Call once per frame; the returned array is reused each call.
   * @returns {Uint8Array|null} null when not listening.
   */
  getWaveformData() {
    if (!this._analyserNode) return null;
    this._analyserNode.getByteTimeDomainData(this._waveData);
    return this._waveData;
  }

  /**
   * Returns the root-mean-square loudness normalised to 0–1.
   * Reads from the most recently fetched frequency data.
   * @returns {number}
   */
  getRMS() {
    if (!this._freqData) return 0;
    let sum = 0;
    for (let i = 0; i < this._freqData.length; i++) {
      const v = this._freqData[i] / 255;
      sum += v * v;
    }
    return Math.sqrt(sum / this._freqData.length);
  }

  /**
   * Returns true on frames where a bass beat is detected.
   * Should be called after getFrequencyData() each frame.
   *
   * Method: compare average of the lowest `bassRatio` fraction of bins
   * against an exponential moving average (EMA). A beat fires when the
   * current value exceeds `ema * beatThreshold`. A cooldown prevents
   * rapid consecutive beats.
   *
   * @returns {boolean}
   */
  isBeat() {
    if (!this._freqData) return false;

    const bassBins = Math.max(
      1,
      Math.floor(this._freqData.length * this._bassRatio)
    );
    let bassSum = 0;
    for (let i = 0; i < bassBins; i++) bassSum += this._freqData[i];
    const bassAvg = bassSum / bassBins / 255; // 0–1

    // Exponential moving average — tracks baseline slowly
    this._bassEma = this._bassEma * 0.95 + bassAvg * 0.05;

    const now = performance.now();
    const cooldownOk = now - this._lastBeatTime > this._beatCooldownMs;
    const isSpike = bassAvg > this._bassEma * this._beatThreshold && bassAvg > 0.1;

    if (isSpike && cooldownOk) {
      this._lastBeatTime = now;
      return true;
    }
    return false;
  }

  /** Number of frequency bins (= fftSize / 2). */
  get binCount() {
    return this._analyserNode ? this._analyserNode.frequencyBinCount : this._fftSize / 2;
  }
}
