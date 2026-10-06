import {CaptionsClient} from './CaptionsClient.js';

/** Main-thread handle for the translation worker, one language at a time. */
export class TranslationClient extends CaptionsClient {
  /**
   * @param {{createWorker?: () => Worker, now?: () => number}} [options]
   */
  constructor({
    createWorker = () =>
      new Worker(new URL('./translationWorker.js', import.meta.url), {
        type: 'module',
      }),
    now,
  } = {}) {
    super({createWorker, now});
    /** Language code of the loaded model, or null. */
    this.language = null;
    this._unloading = null;
  }

  /**
   * @param {string} language
   * @param {{onProgress?: (event: {loaded: number, total: number, file: string}) => void}} [options]
   */
  async download(language, {onProgress} = {}) {
    if (this._unloading) await this._unloading;
    this._assertAvailable();
    return this._send('download', 'downloading', {language}, {onProgress})
      .promise;
  }

  /** @param {string} language */
  async load(language) {
    if (this._unloading) await this._unloading;
    this._assertAvailable();
    if (this.loaded) throw new Error('A translation model is already loaded.');
    const result = await this._send('load', 'loading', {language}).promise;
    this.language = language;
    return result;
  }

  /** @param {string} text */
  translate(text) {
    this._assertAvailable();
    if (!this.loaded) throw new Error('Load a translation model first.');
    if (typeof text !== 'string' || !text.trim()) {
      throw new Error('Invalid text to translate.');
    }
    return this._send('translate', 'translating', {text}).promise;
  }

  /**
   * Free the model but keep the worker, whose runtime import needs the network.
   * Waits for an in-flight request; load and download wait for the unload.
   */
  unload() {
    this.loaded = false;
    this.language = null;
    if (this._unloading) return this._unloading;
    if (this._closing || !this._worker) return Promise.resolve();
    const unloading = (async () => {
      await this._active?.promise.catch(() => {});
      if (this._closing || !this._worker) return;
      this.loaded = false;
      this.language = null;
      await this._send('unload', 'unloading').promise;
    })()
      .catch((error) => this._reset(error))
      .finally(() => {
        this._unloading = null;
      });
    this._unloading = unloading;
    return unloading;
  }

  _validate(pending, result) {
    super._validate(pending, result);
    if (
      pending.type === 'translate' &&
      (typeof result.text !== 'string' ||
        typeof result.language !== 'string' ||
        !Number.isFinite(result.translateMs))
    ) {
      throw new Error('Malformed translation worker result.');
    }
  }

  _reset(error) {
    this.language = null;
    super._reset(error);
  }
}
