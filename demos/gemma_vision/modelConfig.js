export const MODEL_ID = 'onnx-community/gemma-4-E2B-it-ONNX';
export const REVISION = '9f4bef82ea6e296bc69f8a2f5939f73af81b07a6';
export const MODEL_BASE = `https://huggingface.co/${MODEL_ID}/resolve/${REVISION}/`;
export const RUNTIME_URL =
  'https://cdn.jsdelivr.net/npm/@huggingface/transformers@4.3.0/dist/transformers.min.js';
export const ORT_BASE =
  'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.0-dev.20260914-8d85527a0/dist/';
export const CACHE_NAME = 'xrblocks-gemma-vision-4.3.0';

/** Required files for q4f16 model loading and explicit processor hydration. */
export const MODEL_FILES = Object.freeze({
  'onnx/audio_encoder_q4f16.onnx': 260446,
  'onnx/audio_encoder_q4f16.onnx_data': 171258112,
  'onnx/decoder_model_merged_q4f16.onnx': 673231,
  'onnx/decoder_model_merged_q4f16.onnx_data': 1519700992,
  'onnx/embed_tokens_q4f16.onnx': 5621,
  'onnx/embed_tokens_q4f16.onnx_data': 1590689792,
  'onnx/vision_encoder_q4f16.onnx': 189124,
  'onnx/vision_encoder_q4f16.onnx_data': 99189440,
  'config.json': 5549,
  'generation_config.json': 238,
  'processor_config.json': 1689,
  'chat_template.jinja': 16317,
  'tokenizer_config.json': 18807,
  'tokenizer.json': 19439251,
});

export const MODEL_BYTES = Object.values(MODEL_FILES).reduce(
  (total, bytes) => total + bytes,
  0
);
export const IMAGE_BUDGET = 140;

const LITE_ID = 'HuggingFaceTB/SmolVLM2-500M-Video-Instruct';
const LITE_REVISION = '7b375e1b73b11138ff12fe22c8f2822d8fe03467';

/** Required q4f16 files for the Lite model; the tokenizer is built from tokenizer.json. */
const LITE_FILES = Object.freeze({
  'onnx/decoder_model_merged_q4f16.onnx': 205328508,
  'onnx/embed_tokens_q4f16.onnx': 94618005,
  'onnx/vision_encoder_q4f16.onnx': 57691749,
  'config.json': 3767,
  'generation_config.json': 136,
  'preprocessor_config.json': 599,
  'processor_config.json': 67,
  'chat_template.json': 430,
  'tokenizer.json': 3548256,
  'tokenizer_config.json': 28626,
});

function sumBytes(files) {
  return Object.values(files).reduce((total, bytes) => total + bytes, 0);
}

/**
 * On-device vision models offered by the chooser. Each entry pins a revision
 * and the exact byte length of every file it reads.
 */
export const MODELS = Object.freeze({
  gemma: Object.freeze({
    key: 'gemma',
    family: 'gemma4',
    name: 'Gemma 4',
    choiceLabel: 'Gemma 4 E2B (3.4 GB)',
    downloadLabel: 'Download Gemma 4 (~3.4 GB)',
    cachedLabel: 'Load cached Gemma 4',
    modelId: MODEL_ID,
    revision: REVISION,
    base: MODEL_BASE,
    files: MODEL_FILES,
    bytes: MODEL_BYTES,
    processorFiles: Object.freeze({
      processorConfig: 'processor_config.json',
      tokenizerJSON: 'tokenizer.json',
      tokenizerConfig: 'tokenizer_config.json',
      chatTemplate: 'chat_template.jinja',
    }),
    imageBudget: IMAGE_BUDGET,
    imageBudgets: Object.freeze([70, 140, 280]),
    eosTokens: Object.freeze([1, 106, 50]),
    presets: Object.freeze(['describe', 'read', 'translate']),
  }),
  lite: Object.freeze({
    key: 'lite',
    family: 'smolvlm',
    name: 'Lite',
    choiceLabel: 'Lite: SmolVLM2 (360 MB)',
    downloadLabel: 'Download Lite (~360 MB)',
    cachedLabel: 'Load cached Lite',
    modelId: LITE_ID,
    revision: LITE_REVISION,
    base: `https://huggingface.co/${LITE_ID}/resolve/${LITE_REVISION}/`,
    files: LITE_FILES,
    bytes: sumBytes(LITE_FILES),
    processorFiles: Object.freeze({
      processorConfig: 'processor_config.json',
      imageProcessorConfig: 'preprocessor_config.json',
      tokenizerJSON: 'tokenizer.json',
      tokenizerConfig: 'tokenizer_config.json',
      chatTemplate: 'chat_template.json',
    }),
    // 64 tokens: one 512 px view. 320 tokens: up to four 512 px tiles plus it.
    imageBudget: 64,
    imageBudgets: Object.freeze([64, 320]),
    eosTokens: Object.freeze([49279]),
    presets: Object.freeze(['describe', 'read']),
  }),
});

export const DEFAULT_MODEL = 'gemma';

/**
 * @param {unknown} key
 * @returns {(typeof MODELS)[keyof typeof MODELS]}
 */
export function getModel(key) {
  if (typeof key !== 'string' || !Object.hasOwn(MODELS, key)) {
    throw new Error(`Unknown vision model: ${String(key)}`);
  }
  return MODELS[key];
}
