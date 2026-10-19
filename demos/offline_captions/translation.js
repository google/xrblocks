export const MAX_WAITING = 2;

/**
 * Translates finalized caption lines one at a time. At most MAX_WAITING lines
 * wait; when more arrive the oldest waiting line is skipped so the newest
 * speech stays current. Clearing or changing the language starts a new
 * generation, and results from an older generation are dropped.
 */
export class TranslationQueue {
  /**
   * @param {{
   *   translate: (text: string) => Promise<{text: string, language: string, translateMs: number}>,
   *   onResult: (id: number, result: {text: string, language: string, translateMs: number}, meta: unknown) => void,
   *   onError: (error: Error, id: number) => void,
   *   onSkip?: (id: number) => void,
   *   maxWaiting?: number,
   * }} callbacks
   */
  constructor({
    translate,
    onResult,
    onError,
    onSkip = () => {},
    maxWaiting = MAX_WAITING,
  }) {
    this.translate = translate;
    this.onResult = onResult;
    this.onError = onError;
    this.onSkip = onSkip;
    this.maxWaiting = maxWaiting;
    this.generation = 0;
    /** @type {{id: number, text: string, meta: unknown} | null} */
    this.running = null;
    /** @type {{id: number, text: string, meta: unknown}[]} */
    this.waiting = [];
  }

  get busy() {
    return this.running !== null || this.waiting.length > 0;
  }

  /**
   * Queue one finalized line. A repeated id replaces its waiting text.
   * @param {number} id
   * @param {string} text
   * @param {unknown} [meta]
   */
  submit(id, text, meta) {
    text = String(text ?? '').trim();
    if (!text || this.running?.id === id) return;
    const existing = this.waiting.find((job) => job.id === id);
    if (existing) {
      existing.text = text;
      existing.meta = meta;
    } else {
      this.waiting.push({id, text, meta});
      while (this.waiting.length > this.maxWaiting) {
        this.onSkip(this.waiting.shift().id);
      }
    }
    this.pump();
  }

  /** Drop waiting lines and ignore the result that is still in flight. */
  clear() {
    this.generation++;
    this.waiting = [];
  }

  pump() {
    if (this.running) return;
    const job = this.waiting.shift();
    if (!job) return;
    const generation = this.generation;
    this.running = job;
    let promise;
    try {
      promise = Promise.resolve(this.translate(job.text));
    } catch (error) {
      promise = Promise.reject(error);
    }
    promise
      .then(
        (result) => {
          if (generation === this.generation) {
            this.onResult(job.id, result, job.meta);
          }
        },
        (error) => {
          if (generation === this.generation) {
            this.onError(
              error instanceof Error ? error : new Error(String(error)),
              job.id
            );
          }
        }
      )
      .finally(() => {
        if (this.running === job) this.running = null;
        this.pump();
      });
  }
}
