/**
 * Serializes transcription on one worker. Final utterances queue in order;
 * interim requests run only when nothing else is waiting. Results from a
 * cleared generation or for an already submitted final are dropped.
 */
export class CaptionScheduler {
  /**
   * @param {{
   *   transcribe: (audio: Float32Array, options: {final: boolean}) => Promise<TranscriptionResult>,
   *   onPartial: (id: number, result: TranscriptionResult) => void,
   *   onFinal: (id: number, result: TranscriptionResult, meta: unknown) => void,
   *   onError: (error: Error, job: Job) => void,
   * }} callbacks
   */
  constructor({transcribe, onPartial, onFinal, onError}) {
    this.transcribe = transcribe;
    this.onPartial = onPartial;
    this.onFinal = onFinal;
    this.onError = onError;
    this.generation = 0;
    /** @type {Job | null} */
    this.running = null;
    /** @type {Job[]} */
    this.finals = [];
    this.lastFinalId = 0;
  }

  get busy() {
    return this.running !== null || this.finals.length > 0;
  }

  /**
   * @param {number} id
   * @param {Float32Array} audio
   * @returns {boolean} whether the request started.
   */
  requestPartial(id, audio) {
    if (this.busy || id <= this.lastFinalId) return false;
    this.run({kind: 'partial', id, audio, meta: undefined});
    return true;
  }

  /**
   * @param {number} id
   * @param {Float32Array} audio
   * @param {unknown} [meta]
   */
  submitFinal(id, audio, meta) {
    this.lastFinalId = Math.max(this.lastFinalId, id);
    this.finals.push({kind: 'final', id, audio, meta});
    this.pump();
  }

  /** Drop queued work and ignore results that are still in flight. */
  clear() {
    this.generation++;
    this.finals = [];
  }

  pump() {
    if (this.running) return;
    const job = this.finals.shift();
    if (job) this.run(job);
  }

  /** @param {Job} job */
  run(job) {
    const generation = this.generation;
    this.running = job;
    let promise;
    try {
      promise = Promise.resolve(
        this.transcribe(job.audio, {final: job.kind === 'final'})
      );
    } catch (error) {
      promise = Promise.reject(error);
    }
    promise
      .then(
        (result) => {
          if (generation !== this.generation) return;
          if (job.kind === 'final') this.onFinal(job.id, result, job.meta);
          else if (job.id > this.lastFinalId) this.onPartial(job.id, result);
        },
        (error) => {
          if (generation !== this.generation) return;
          this.onError(
            error instanceof Error ? error : new Error(String(error)),
            job
          );
        }
      )
      .finally(() => {
        if (this.running === job) this.running = null;
        this.pump();
      });
  }
}

/**
 * @typedef {{text: string, inferenceMs: number, audioMs: number}} TranscriptionResult
 * @typedef {{kind: 'partial' | 'final', id: number, audio: Float32Array, meta: unknown}} Job
 */
