/**
 * Prompt and response parsing shared by both text-extraction backends
 * (Gemini on the headset, Ollama through the laptop server). The model
 * transcribes the page and, when the text is not English, translates it, so
 * one round trip yields what Matcha-TTS (English-only) can speak.
 */

export const TARGET_LANGUAGE = 'English';

export const OCR_PROMPT =
  'Transcribe all printed text in this photo in natural reading order, with ' +
  'paragraphs separated by blank lines. Do not describe the image. Reply ' +
  'with one JSON object and nothing else: {"language": "<language of the ' +
  'text, named in English, e.g. French>", "text": "<the transcription>", ' +
  `"english": "<the transcription translated to ${TARGET_LANGUAGE}, or the ` +
  'same text unchanged if it is already in that language>"}. If there is ' +
  'no readable text, reply {"language": null, "text": "", "english": ""}.';

/**
 * Turns a model reply into {language, text, english, translated}. Accepts
 * the JSON object with or without a Markdown code fence; anything else is
 * taken as plain transcribed text (older prompts, chatty models). `english`
 * is always the string to speak; `translated` says whether it differs from
 * what was on the page.
 */
export function parseOcrResponse(raw) {
  const trimmed = (raw ?? '').trim();
  const empty = {language: null, text: '', english: '', translated: false};
  if (!trimmed || trimmed === 'NONE') return empty;

  const unfenced = trimmed.replace(/^```(?:json)?\s*([\s\S]*?)\s*```$/i, '$1');
  let parsed = null;
  try {
    parsed = JSON.parse(unfenced);
  } catch {
    // Not JSON: fall through to the plain-text reading.
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {language: null, text: trimmed, english: trimmed, translated: false};
  }
  const text = String(parsed.text ?? '').trim();
  const english = String(parsed.english ?? '').trim() || text;
  if (!text && !english) return empty;
  const language =
    typeof parsed.language === 'string' && parsed.language.trim()
      ? parsed.language.trim()
      : null;
  const isTarget =
    !language ||
    language.toLowerCase().startsWith(TARGET_LANGUAGE.toLowerCase()) ||
    language.toLowerCase() === 'en';
  return {
    language,
    text: text || english,
    english,
    translated: !isTarget && english !== text,
  };
}
