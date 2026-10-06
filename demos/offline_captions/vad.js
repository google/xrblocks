import {TARGET_SAMPLE_RATE, concatFloat32, rms} from './audio.js';

export const VAD_DEFAULTS = Object.freeze({
  sampleRate: TARGET_SAMPLE_RATE,
  frameMs: 30,
  calibrationMs: 300,
  minRms: 0.01,
  noiseMultiplier: 3,
  startFrames: 3,
  endSilenceMs: 600,
  preRollMs: 300,
  trailMs: 150,
  minSpeechMs: 300,
  maxSegmentMs: 12000,
});

/**
 * Energy-based speech segmenter for 16 kHz mono audio. Emits `start` when
 * speech begins and `end` with the utterance audio after trailing silence,
 * at the maximum segment length, or on flush.
 */
export class SpeechSegmenter {
  /** @param {Partial<typeof VAD_DEFAULTS>} [options] */
  constructor(options = {}) {
    const config = {...VAD_DEFAULTS, ...options};
    this.config = config;
    this.frameSize = Math.round((config.sampleRate * config.frameMs) / 1000);
    this.preRollFrames = Math.ceil(config.preRollMs / config.frameMs);
    this.endFrames = Math.ceil(config.endSilenceMs / config.frameMs);
    this.trailFrames = Math.ceil(config.trailMs / config.frameMs);
    this.calibrationFrames = Math.ceil(config.calibrationMs / config.frameMs);
    this.maxFrames = Math.floor(config.maxSegmentMs / config.frameMs);
    this.reset();
  }

  reset() {
    this.remainder = new Float32Array(0);
    /** @type {Float32Array[]} */
    this.history = [];
    /** @type {Float32Array[] | null} */
    this.frames = null;
    this.segmentId = 0;
    this.activeId = null;
    this.voicedRun = 0;
    this.silentRun = 0;
    this.speechFrames = 0;
    this.lastVoicedIndex = -1;
    this.noiseFloor = this.config.minRms / this.config.noiseMultiplier;
    this.level = 0;
    this.processedFrames = 0;
  }

  get threshold() {
    return Math.max(
      this.config.minRms,
      this.noiseFloor * this.config.noiseMultiplier
    );
  }

  /** Milliseconds of audio processed so far. */
  get timeMs() {
    return this.processedFrames * this.config.frameMs;
  }

  get active() {
    return this.activeId !== null;
  }

  /**
   * @param {Float32Array} samples
   * @returns {Array<SegmentEvent>}
   */
  push(samples) {
    const data = concatFloat32([this.remainder, samples]);
    const events = [];
    let offset = 0;
    for (; offset + this.frameSize <= data.length; offset += this.frameSize) {
      const frame = data.slice(offset, offset + this.frameSize);
      this.processFrame(frame, events);
    }
    this.remainder = data.slice(offset);
    return events;
  }

  /** @returns {Float32Array | null} Current utterance audio, for interim text. */
  activeAudio() {
    return this.frames ? concatFloat32(this.frames) : null;
  }

  /** End any active utterance immediately, for example when listening stops. */
  flush() {
    const events = [];
    if (this.frames) this.finish('flush', events);
    this.remainder = new Float32Array(0);
    return events;
  }

  /**
   * @param {Float32Array} frame
   * @param {Array<SegmentEvent>} events
   */
  processFrame(frame, events) {
    this.processedFrames++;
    const level = rms(frame);
    this.level = level;
    if (this.processedFrames <= this.calibrationFrames) {
      // Learn the room level before listening for speech onset.
      this.noiseFloor += (level - this.noiseFloor) / this.processedFrames;
      this.history.push(frame);
      if (this.history.length > this.preRollFrames) this.history.shift();
      return;
    }
    const voiced = level > this.threshold;
    if (!this.frames) {
      // Fall quickly toward quieter rooms, rise slowly with steady noise.
      this.noiseFloor +=
        (level - this.noiseFloor) * (level < this.noiseFloor ? 0.2 : 0.01);
      this.voicedRun = voiced ? this.voicedRun + 1 : 0;
      this.history.push(frame);
      if (this.history.length > this.preRollFrames + this.config.startFrames) {
        this.history.shift();
      }
      if (this.voicedRun >= this.config.startFrames) {
        this.frames = this.history;
        this.history = [];
        this.activeId = ++this.segmentId;
        this.speechFrames = this.voicedRun;
        this.silentRun = 0;
        this.lastVoicedIndex = this.frames.length - 1;
        events.push({type: 'start', id: this.activeId, timeMs: this.timeMs});
      }
      return;
    }
    this.frames.push(frame);
    if (voiced) {
      this.speechFrames++;
      this.silentRun = 0;
      this.lastVoicedIndex = this.frames.length - 1;
    } else {
      this.silentRun++;
    }
    if (this.silentRun >= this.endFrames) this.finish('silence', events);
    else if (this.frames.length >= this.maxFrames) {
      this.finish('max', events);
      // Long speech continues in a new segment without waiting for onset.
      this.frames = [];
      this.activeId = ++this.segmentId;
      this.lastVoicedIndex = -1;
      events.push({type: 'start', id: this.activeId, timeMs: this.timeMs});
    }
  }

  /**
   * @param {'silence' | 'max' | 'flush'} reason
   * @param {Array<SegmentEvent>} events
   */
  finish(reason, events) {
    const frames = this.frames ?? [];
    const keep =
      reason === 'max'
        ? frames.length
        : Math.min(frames.length, this.lastVoicedIndex + 1 + this.trailFrames);
    const id = this.activeId;
    const speechMs = this.speechFrames * this.config.frameMs;
    const silenceMs = this.silentRun * this.config.frameMs;
    this.frames = null;
    this.activeId = null;
    this.voicedRun = 0;
    this.silentRun = 0;
    this.speechFrames = 0;
    this.history = [];
    if (id === null) return;
    const audio = concatFloat32(frames.slice(0, keep));
    events.push({
      type: 'end',
      id,
      reason,
      audio,
      speechMs,
      silenceMs,
      timeMs: this.timeMs,
      tooShort: speechMs < this.config.minSpeechMs,
    });
  }
}

/**
 * @typedef {{type: 'start', id: number, timeMs: number} | {type: 'end', id: number, reason: 'silence' | 'max' | 'flush', audio: Float32Array, speechMs: number, silenceMs: number, timeMs: number, tooShort: boolean}} SegmentEvent
 */
