import {ASSETS, ORT_BASE} from './modelConfig.js';

export const TRANSLATION_DTYPE = 'q8';
/** ONNX Runtime files are shared with the captions model and cached once. */
const ORT_ASSETS = ASSETS.filter(({url}) => url.startsWith(ORT_BASE));

/**
 * English to target language Opus-MT models (Helsinki-NLP, MarianMT) in the
 * Xenova ONNX exports, pinned by revision with exact sizes and SHA-256s.
 */
const LANGUAGE_PINS = [
  {
    code: 'es',
    label: 'Spanish',
    model: 'Xenova/opus-mt-en-es',
    revision: '4b002a4c7edd54a7ced58877258b87f7efd3f892',
    files: [
      [
        'config.json',
        1468,
        '499eae1f97eeba63172fc884f92fd727ae803b7ceb79c0f653aa4b011152af2f',
      ],
      [
        'generation_config.json',
        293,
        'b743baabb7da4c1a2f19fe558bd6b4c0c7c3b0762fcb5ca7a48fe5a2c2219803',
      ],
      [
        'tokenizer.json',
        6262682,
        '285eb29e7155ee48851a77960797813f86a125f70d2c1a124f613f1fbd2b19c3',
      ],
      [
        'tokenizer_config.json',
        282,
        'dfb00189b823fb0f15464e9c4e68dd8594f5e5ef5f8dc497468a37741e73aa1f',
      ],
      [
        'onnx/encoder_model_quantized.onnx',
        52899742,
        '03434edd1147e6c49e22066e9dc5888235e99cc35a6711d1c4ea5b06455d5da9',
      ],
      [
        'onnx/decoder_model_merged_quantized.onnx',
        60212804,
        '58ee5ddd6e22d1693d8722b90c1486afb93700a4376cf28fd74175052ad530ae',
      ],
    ],
  },
  {
    code: 'fr',
    label: 'French',
    model: 'Xenova/opus-mt-en-fr',
    revision: '28726206f80896b90035bd99cccd5cc1e151f916',
    files: [
      [
        'config.json',
        1411,
        'b522b73fcc86f77981349c1df2a2e041eed0dbcbea4acf2635019cf21d51ffc0',
      ],
      [
        'generation_config.json',
        293,
        'f9a4824ec78c61b4a95afc43bbb6a9545a44ccf1c01d0963a286e799b9e7b256',
      ],
      [
        'tokenizer.json',
        5637839,
        '8391785c1a2139e7af4678571ccd8dc654ecbb72e4be186940f65d7c604f0246',
      ],
      [
        'tokenizer_config.json',
        280,
        'eb8dfaa142fe03627c8d035415f56c46284b6ee4a16e54c6e8236928ac5a1170',
      ],
      [
        'onnx/encoder_model_quantized.onnx',
        50090398,
        '0a81bdba62f53223740a8c6c6f58e716eba8ea1f92dfa569caf27ed5e3b6a0f7',
      ],
      [
        'onnx/decoder_model_merged_quantized.onnx',
        57381512,
        '333b244bce16023df04541c8cf9fd60aec9b0569da393c4b831d561897b0bda8',
      ],
    ],
  },
  {
    code: 'de',
    label: 'German',
    model: 'Xenova/opus-mt-en-de',
    revision: '1ca130c44c4c5441ef16d48aae521a424ab644f7',
    files: [
      [
        'config.json',
        1411,
        '517955ebf66cd6523f9982851dd41771b74fb2d9c00b4933ba2922ac7a63336f',
      ],
      [
        'generation_config.json',
        293,
        'cd16a899388283889c6e87b903c689ce73430aaa18335415f9d9ea770606538e',
      ],
      [
        'tokenizer.json',
        5498450,
        '8e0fcf45621ea87fa680c7f9969c37a7f819c1f4c7658a2e6e0879b866a14b17',
      ],
      [
        'tokenizer_config.json',
        280,
        '4500a1295197174119cf17f9b2e6eab2d5c3a9c64009fb1e37ebd2868bf1161c',
      ],
      [
        'onnx/encoder_model_quantized.onnx',
        49366942,
        '15834b45fabd2dfb8c6c029b3ca3e7289aeefd90ece798ce42bcf548d1bd3b8d',
      ],
      [
        'onnx/decoder_model_merged_quantized.onnx',
        56652404,
        '8b46a825964cdd182fe47cc780f0fb87d357eae1f47cf20aa63c1c09be5b510c',
      ],
    ],
  },
];

export const LANGUAGES = Object.freeze(
  LANGUAGE_PINS.map(({files, ...pin}) => {
    const base = `https://huggingface.co/${pin.model}/resolve/${pin.revision}/`;
    const modelAssets = files.map(([file, bytes, sha256]) =>
      Object.freeze({file, url: base + file, bytes, sha256})
    );
    const modelBytes = modelAssets.reduce((sum, {bytes}) => sum + bytes, 0);
    return Object.freeze({
      ...pin,
      base,
      modelBytes,
      assets: Object.freeze([...modelAssets, ...ORT_ASSETS]),
      downloadLabel: `Download ${pin.label} (~${Math.round(modelBytes / 1e6)} MB)`,
      cachedLabel: `Load cached ${pin.label}`,
      loadedLabel: `${pin.label} ready`,
    });
  })
);

/** @param {string} code */
export function getLanguage(code) {
  const language = LANGUAGES.find((candidate) => candidate.code === code);
  if (!language) throw new Error(`Unknown translation language: ${code}`);
  return language;
}
