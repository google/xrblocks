import {FilesetResolver, LanguageDetector} from '@mediapipe/tasks-text';

// Display names for the BCP-47 codes the bundled MediaPipe model can return.
// Anything not in the table just shows the raw code.
const LANGUAGE_NAMES = {
  af: 'Afrikaans',
  am: 'Amharic',
  ar: 'Arabic',
  az: 'Azerbaijani',
  be: 'Belarusian',
  bg: 'Bulgarian',
  bn: 'Bengali',
  bs: 'Bosnian',
  ca: 'Catalan',
  ceb: 'Cebuano',
  co: 'Corsican',
  cs: 'Czech',
  cy: 'Welsh',
  da: 'Danish',
  de: 'German',
  el: 'Greek',
  en: 'English',
  eo: 'Esperanto',
  es: 'Spanish',
  et: 'Estonian',
  eu: 'Basque',
  fa: 'Persian',
  fi: 'Finnish',
  fr: 'French',
  fy: 'Frisian',
  ga: 'Irish',
  gd: 'Scots Gaelic',
  gl: 'Galician',
  gu: 'Gujarati',
  ha: 'Hausa',
  haw: 'Hawaiian',
  hi: 'Hindi',
  hmn: 'Hmong',
  hr: 'Croatian',
  ht: 'Haitian Creole',
  hu: 'Hungarian',
  hy: 'Armenian',
  id: 'Indonesian',
  ig: 'Igbo',
  is: 'Icelandic',
  it: 'Italian',
  iw: 'Hebrew',
  ja: 'Japanese',
  jv: 'Javanese',
  ka: 'Georgian',
  kk: 'Kazakh',
  km: 'Khmer',
  kn: 'Kannada',
  ko: 'Korean',
  ku: 'Kurdish',
  ky: 'Kyrgyz',
  la: 'Latin',
  lb: 'Luxembourgish',
  lo: 'Lao',
  lt: 'Lithuanian',
  lv: 'Latvian',
  mg: 'Malagasy',
  mi: 'Maori',
  mk: 'Macedonian',
  ml: 'Malayalam',
  mn: 'Mongolian',
  mr: 'Marathi',
  ms: 'Malay',
  mt: 'Maltese',
  my: 'Burmese',
  ne: 'Nepali',
  nl: 'Dutch',
  no: 'Norwegian',
  ny: 'Chichewa',
  pa: 'Punjabi',
  pl: 'Polish',
  ps: 'Pashto',
  pt: 'Portuguese',
  ro: 'Romanian',
  ru: 'Russian',
  sd: 'Sindhi',
  si: 'Sinhala',
  sk: 'Slovak',
  sl: 'Slovenian',
  sm: 'Samoan',
  sn: 'Shona',
  so: 'Somali',
  sq: 'Albanian',
  sr: 'Serbian',
  st: 'Sesotho',
  su: 'Sundanese',
  sv: 'Swedish',
  sw: 'Swahili',
  ta: 'Tamil',
  te: 'Telugu',
  tg: 'Tajik',
  th: 'Thai',
  tl: 'Tagalog',
  tr: 'Turkish',
  uk: 'Ukrainian',
  ur: 'Urdu',
  uz: 'Uzbek',
  vi: 'Vietnamese',
  xh: 'Xhosa',
  yi: 'Yiddish',
  yo: 'Yoruba',
  'zh-Latn': 'Chinese (Latin)',
  zh: 'Chinese',
  zu: 'Zulu',
};

const WASM_BASE =
  'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-text@0.10.35/wasm';
const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/language_detector/language_detector/float32/1/language_detector.tflite';

export function languageName(code) {
  return LANGUAGE_NAMES[code] || code;
}

export class LanguageDetectorClient {
  constructor() {
    this.detector = null;
    this._loading = null;
  }

  async load() {
    if (this.detector) return this.detector;
    if (this._loading) return this._loading;
    this._loading = (async () => {
      const text = await FilesetResolver.forTextTasks(WASM_BASE);
      this.detector = await LanguageDetector.createFromOptions(text, {
        baseOptions: {modelAssetPath: MODEL_URL},
        maxResults: 3,
      });
      return this.detector;
    })();
    return this._loading;
  }

  detect(input) {
    if (!this.detector || !input || !input.trim()) return [];
    const result = this.detector.detect(input);
    return result?.languages || [];
  }
}
