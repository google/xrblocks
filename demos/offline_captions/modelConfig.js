export const MODEL_ID = 'onnx-community/moonshine-base-ONNX';
export const REVISION = 'b1e9b6aae3c3c7298f10c3798393fdf38e8fbbad';
export const MODEL_BASE = `https://huggingface.co/${MODEL_ID}/resolve/${REVISION}/`;
export const MODEL_DTYPE = 'q8';
export const TRANSFORMERS_VERSION = '4.3.0';
export const RUNTIME_URL = `https://cdn.jsdelivr.net/npm/@huggingface/transformers@${TRANSFORMERS_VERSION}/dist/transformers.min.js`;
export const ORT_BASE =
  'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.0-dev.20260914-8d85527a0/dist/';
export const CACHE_NAME = `xrblocks-offline-captions-${TRANSFORMERS_VERSION}`;

/**
 * Every file the worker needs, with exact byte counts and SHA-256 digests.
 * The explicit Download action is the only code path that fetches these.
 */
export const ASSETS = Object.freeze(
  [
    [
      'config.json',
      922,
      'fab7241d1e9fc6c2370c4c6dfb5da79bb54d67ed9ab6b507ac51d29d2abe01d1',
    ],
    [
      'generation_config.json',
      147,
      'f9b3f711b57be7def2e50a8942f64f36ee0a55fad5b84ff93a687b6c5bcc1d44',
    ],
    [
      'tokenizer.json',
      3761754,
      '7b913404bdd039af4756783218af4440bc07fb7d6d8258d677e34f95b3ec416f',
    ],
    [
      'tokenizer_config.json',
      135735,
      'edaee394565d428ea98a663ae7209cdcfeefc5585c42d7a570ff7c986df2cd15',
    ],
    [
      'onnx/encoder_model_quantized.onnx',
      20513063,
      '1dd9ab0a7f987113d30affcba5a068d11c8f90fa0223caa3e491ade431ad9751',
    ],
    [
      'onnx/decoder_model_merged_quantized.onnx',
      42498870,
      'cc9f3cd6698a369c6008b41aa60aa3fb3322e7f03c9bdf19d8e6b7200afca4f3',
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
export const DOWNLOAD_LABEL = `Download captions model (~${Math.round(TOTAL_BYTES / 1e6)} MB)`;
export const CACHED_LABEL = 'Load cached captions model';
export const LOADED_LABEL = 'Captions model ready';
