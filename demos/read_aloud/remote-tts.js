/**
 * Client for the laptop-side Read Aloud server (`server/server.py`): Matcha-TTS
 * on LiteRT plus an optional Ollama OCR proxy. The headset reaches it through
 * a forwarded localhost port, so the page never needs wasm threads itself.
 */

export const DEFAULT_SERVER_URL = 'http://localhost:8790';

const SENTENCE_END = /[.!?…]/;

/**
 * Splits text into short sentence-sized requests so playback can start
 * before the whole passage is synthesized. Blank lines and sentence-final
 * punctuation both split; long run-ons are cut at about 60 characters on the
 * next punctuation-free boundary the server would chunk anyway.
 */
export function splitSentences(text) {
  const parts = [];
  for (const paragraph of text.split(/\n\s*\n/)) {
    let buffer = '';
    for (const piece of paragraph.trim().split(/(?<=[.!?…])\s+/)) {
      const trimmed = piece.trim();
      if (!trimmed) continue;
      buffer = (buffer + ' ' + trimmed).trim();
      if (buffer.length >= 60 || SENTENCE_END.test(trimmed.at(-1))) {
        parts.push(buffer);
        buffer = '';
      }
    }
    if (buffer) parts.push(buffer);
  }
  return parts;
}

export class RemoteTts {
  /**
   * @param baseUrl - Server origin, e.g. `http://localhost:8790`.
   * @param audioContext - Context used to decode the returned WAV.
   */
  constructor(baseUrl = DEFAULT_SERVER_URL, audioContext) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
    this.audioContext = audioContext;
    this.health = null;
  }

  /** Probes the server. Resolves with its health JSON or throws. */
  async connect({timeoutMs = 3000} = {}) {
    const response = await fetch(`${this.baseUrl}/health`, {
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!response.ok) throw new Error(`server HTTP ${response.status}`);
    this.health = await response.json();
    return this.health;
  }

  describe() {
    const tts = this.health?.tts;
    if (!tts) return 'not connected';
    return `${tts.engine} · ${tts.threads} threads · ${tts.steps} steps`;
  }

  get ollamaAvailable() {
    return this.health?.ocr?.ollamaAvailable === true;
  }

  /**
   * Synthesizes one sentence.
   * @returns `{buffer: AudioBuffer|null, timings, chunks}`; `buffer` is null
   *   when nothing in the text was pronounceable.
   */
  async synthesize(text, {steps, seed, signal} = {}) {
    const response = await fetch(`${this.baseUrl}/tts`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({text, steps, seed}),
      signal,
    });
    if (!response.ok) {
      throw new Error(await describeFailure(response));
    }
    const chunks = Number(response.headers.get('X-Chunks') ?? 0);
    const timings = parseJson(response.headers.get('X-Timings')) ?? {};
    if (!response.headers.get('Content-Type')?.startsWith('audio/')) {
      return {buffer: null, timings, chunks};
    }
    const buffer = await this.audioContext.decodeAudioData(
      await response.arrayBuffer()
    );
    return {buffer, timings, chunks};
  }

  /**
   * Speaks a whole passage sentence by sentence. Yields
   * `{buffer, index, count, timings}` as each sentence arrives; the next
   * request is issued while the caller plays the current one.
   */
  async *speak(text, {steps, seed, signal} = {}) {
    const sentences = splitSentences(text);
    let pending = sentences.length
      ? this.synthesize(sentences[0], {steps, seed, signal})
      : null;
    for (let i = 0; i < sentences.length; i++) {
      const result = await pending;
      pending =
        i + 1 < sentences.length
          ? this.synthesize(sentences[i + 1], {steps, seed, signal})
          : null;
      if (result.buffer) {
        yield {...result, index: i, count: sentences.length};
      }
    }
  }

  /** Extracts text from a base64 image through the server's Ollama proxy. */
  async ocr(base64, mimeType = 'image/jpeg', {signal} = {}) {
    const response = await fetch(`${this.baseUrl}/ocr`, {
      method: 'POST',
      headers: {'Content-Type': 'application/json'},
      body: JSON.stringify({image: base64, mimeType}),
      signal,
    });
    if (!response.ok) {
      throw new Error(await describeFailure(response));
    }
    const body = await response.json();
    return {text: (body.text ?? '').trim(), model: body.model, ms: body.ms};
  }
}

function parseJson(text) {
  try {
    return text ? JSON.parse(text) : null;
  } catch {
    return null;
  }
}

async function describeFailure(response) {
  const body = parseJson(await response.text().catch(() => ''));
  return body?.error ?? `server HTTP ${response.status}`;
}
