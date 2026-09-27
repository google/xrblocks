import {CaptionsRuntime, configureRuntime} from './CaptionsRuntime.js';
import {TRANSLATION_DTYPE, getLanguage} from './translationConfig.js';

export const MAX_TEXT_CHARS = 1000;
export const MAX_INPUT_TOKENS = 256;
export const MAX_NEW_TOKENS = 256;

/** Bounded greedy output length, a little over twice the input length. */
export function maxNewTokens(inputTokens) {
  return Math.min(MAX_NEW_TOKENS, 2 * inputTokens + 10);
}

/** Worker-side translation handler for one Opus-MT language at a time. */
export class TranslationRuntime extends CaptionsRuntime {
  constructor(options) {
    super(options);
    this.language = null;
  }

  perform(message, operation) {
    switch (message.type) {
      case 'check':
        this.probe();
        return {};
      case 'download':
        return this.download(operation, getLanguage(message.language).assets);
      case 'load':
        return this.loadLanguage(getLanguage(message.language));
      case 'translate':
        return this.translate(message.text);
      case 'unload':
        return this.unloadModel();
      default:
        throw new Error(`Unknown translation operation: ${message.type}`);
    }
  }

  async loadLanguage(language) {
    if (this.model) throw new Error('A translation model is already loaded.');
    this.probe();
    const cached = await this.store.inspectCache({assets: language.assets});
    if (!cached.complete) {
      throw new Error(`${language.label} is not cached. Choose Download.`);
    }
    const started = this.now();
    const tf = await this.loadRuntime();
    configureRuntime(tf, this.store);
    const read = (file) =>
      this.store.readCachedJSON(file, {
        assets: language.assets,
        base: language.base,
      });
    const tokenizer = new tf.MarianTokenizer(
      await read('tokenizer.json'),
      await read('tokenizer_config.json')
    );
    const model = await tf.MarianMTModel.from_pretrained(language.model, {
      revision: language.revision,
      dtype: TRANSLATION_DTYPE,
      device: 'wasm',
    });
    this.tf = tf;
    this.tokenizer = tokenizer;
    this.model = model;
    this.language = language;
    const loadMs = this.now() - started;
    const warmupStarted = this.now();
    await this.run('Hello.');
    return {loadMs, warmupMs: this.now() - warmupStarted};
  }

  async unloadModel() {
    const model = this.model;
    this.model = null;
    this.tokenizer = null;
    this.language = null;
    await model?.dispose?.();
    return {};
  }

  async translate(text) {
    if (!this.model) throw new Error('Load a translation model first.');
    if (
      typeof text !== 'string' ||
      !text.trim() ||
      text.length > MAX_TEXT_CHARS
    ) {
      throw new Error('Invalid text to translate.');
    }
    const started = this.now();
    const translation = await this.run(text.trim());
    return {
      text: translation,
      language: this.language.code,
      translateMs: this.now() - started,
    };
  }

  async run(text) {
    const inputs = this.tokenizer(text, {
      truncation: true,
      max_length: MAX_INPUT_TOKENS,
    });
    let output;
    try {
      output = await this.model.generate({
        ...inputs,
        max_new_tokens: maxNewTokens(inputs.input_ids.dims.at(-1)),
        do_sample: false,
        num_beams: 1,
      });
      return this.tokenizer
        .batch_decode(output, {skip_special_tokens: true})[0]
        .trim();
    } finally {
      output?.dispose?.();
      inputs.input_ids?.dispose?.();
      inputs.attention_mask?.dispose?.();
    }
  }
}
