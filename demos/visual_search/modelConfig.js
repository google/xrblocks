export const MODEL_ID = 'Xenova/clip-vit-base-patch32';
export const REVISION = 'd15189d7028b43f1d3e65039190477f6af591c2a';
export const MODEL_BASE = `https://huggingface.co/${MODEL_ID}/resolve/${REVISION}/`;
export const MODEL_DTYPE = 'q8';
export const TRANSFORMERS_VERSION = '4.3.0';
export const RUNTIME_URL = `https://cdn.jsdelivr.net/npm/@huggingface/transformers@${TRANSFORMERS_VERSION}/dist/transformers.min.js`;
export const ORT_BASE =
  'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.0-dev.20260914-8d85527a0/dist/';
export const CACHE_NAME = `xrblocks-visual-search-${TRANSFORMERS_VERSION}`;

/**
 * Every file the worker needs, with exact byte counts and SHA-256 digests.
 * The explicit Download action is the only code path that fetches these.
 */
export const ASSETS = Object.freeze(
  [
    [
      'config.json',
      4524,
      '493ef57ff783e42d1530c91b53469b7fdf8db8a9c1408e86998fcb7899a4f495',
    ],
    [
      'preprocessor_config.json',
      520,
      '6f638fb9401a6d6296feff533ee7efe657b787c49f954f82f5906b36ef2a1b1f',
    ],
    [
      'tokenizer.json',
      2224119,
      'f7f3b7af117d467b58374797691a6438d3e6b9e9cef800dfd5dced7f697a90cd',
    ],
    [
      'tokenizer_config.json',
      775,
      '60ba2912bc6344c94bc16bbdec27fa1209409167b6f2fdf3cfe9e65462ea3967',
    ],
    [
      'onnx/text_model_quantized.onnx',
      64504507,
      '73baab855d406190da9faa498cfedf65f15cf309f4cc7385b7b032e6d08e5c3a',
    ],
    [
      'onnx/vision_model_quantized.onnx',
      89117001,
      '583fd1110a514667812fee7d684952aaf82a99b959760c8d7dca7e0ab9839299',
    ],
  ]
    .map(([file, bytes, sha256]) => ({
      file,
      url: MODEL_BASE + file,
      bytes,
      sha256,
    }))
    .concat(
      [
        [
          'ort-wasm-simd-threaded.asyncify.mjs',
          53057,
          '0966b6105cd936744498aa60df7a22cbd47af3374dbc64a9ab561c08a71e3611',
        ],
        [
          'ort-wasm-simd-threaded.asyncify.wasm',
          26861777,
          '49871f5a4409519797e127440868a6d1923339d9185907f301a5b2a1d90af082',
        ],
      ].map(([file, bytes, sha256]) => ({
        file,
        url: ORT_BASE + file,
        bytes,
        sha256,
      }))
    )
    .map((asset) => Object.freeze(asset))
);

export const TOTAL_BYTES = ASSETS.reduce((total, {bytes}) => total + bytes, 0);
export const DOWNLOAD_LABEL = `Download search model (~${Math.round(TOTAL_BYTES / 1e6)} MB)`;
export const CACHED_LABEL = 'Load cached search model';
export const LOADED_LABEL = 'Search model ready';
