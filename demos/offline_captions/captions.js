export const UPDATE_MS = 100;
export const MAX_LINES = 60;
export const PLACEHOLDER = 'Captions appear here.';
export const TRANSLATION_MARK = '→';

/**
 * Finalized caption lines, each optionally followed by its translation, plus
 * one interim line, rendered as one string.
 */
export class CaptionLog {
  constructor({maxLines = MAX_LINES} = {}) {
    this.maxLines = maxLines;
    /** @type {string[]} */
    this.lines = [];
    /** Segment id of each finalized line. */
    this.lineIds = [];
    /** @type {Map<number, string>} */
    this.translations = new Map();
    this.showTranslations = false;
    /** @type {{id: number, text: string} | null} */
    this.interim = null;
    /** Highest segment id that has been finalized. */
    this.finalizedId = 0;
    this.revision = 0;
  }

  /**
   * @param {number} id
   * @param {string} text
   * @returns {boolean} whether the visible text changed.
   */
  setInterim(id, text) {
    if (id <= this.finalizedId) return false;
    text = normalize(text);
    if (this.interim?.id === id && this.interim.text === text) return false;
    this.interim = {id, text};
    this.revision++;
    return true;
  }

  /**
   * @param {number} id
   * @param {string} text
   * @returns {boolean} whether the visible text changed.
   */
  finalize(id, text) {
    if (id <= this.finalizedId) return false;
    this.finalizedId = id;
    text = normalize(text);
    const hadInterim = this.interim !== null && this.interim.id <= id;
    if (hadInterim) this.interim = null;
    if (!text) {
      if (hadInterim) this.revision++;
      return hadInterim;
    }
    this.lines.push(text);
    this.lineIds.push(id);
    if (this.lines.length > this.maxLines) {
      const removed = this.lines.length - this.maxLines;
      this.lines.splice(0, removed);
      for (const old of this.lineIds.splice(0, removed)) {
        this.translations.delete(old);
      }
    }
    this.revision++;
    return true;
  }

  /**
   * @param {number} id A finalized line's segment id.
   * @param {string} text
   * @returns {boolean} whether the visible text changed.
   */
  setTranslation(id, text) {
    text = normalize(text);
    if (!text || !this.lineIds.includes(id)) return false;
    if (this.translations.get(id) === text) return false;
    this.translations.set(id, text);
    if (this.showTranslations) this.revision++;
    return this.showTranslations;
  }

  /** @returns {boolean} whether the visible text changed. */
  setShowTranslations(show) {
    show = !!show;
    if (this.showTranslations === show) return false;
    this.showTranslations = show;
    if (!this.translations.size) return false;
    this.revision++;
    return true;
  }

  /** @returns {boolean} whether the visible text changed. */
  clearTranslations() {
    if (!this.translations.size) return false;
    this.translations.clear();
    if (this.showTranslations) this.revision++;
    return this.showTranslations;
  }

  /** Drop the interim line without finalizing, for example a skipped noise. */
  dropInterim(id) {
    if (this.interim?.id !== id) return false;
    this.interim = null;
    this.revision++;
    return true;
  }

  clear() {
    this.lines = [];
    this.lineIds = [];
    this.translations.clear();
    this.interim = null;
    this.revision++;
  }

  get empty() {
    return !this.lines.length && !this.interim?.text;
  }

  render() {
    if (this.empty) return PLACEHOLDER;
    const parts = [];
    this.lines.forEach((line, index) => {
      parts.push(line);
      const translation =
        this.showTranslations && this.translations.get(this.lineIds[index]);
      if (translation) parts.push(`${TRANSLATION_MARK} ${translation}`);
    });
    if (this.interim?.text) parts.push(`${this.interim.text} …`);
    return parts.join('\n');
  }
}

/** Latest-value throttle: at most one delivery per interval plus a final flush. */
export class Throttle {
  /**
   * @param {(value: unknown) => void} deliver
   * @param {{intervalMs?: number, now?: () => number}} [options]
   */
  constructor(
    deliver,
    {intervalMs = UPDATE_MS, now = () => performance.now()} = {}
  ) {
    this.deliver = deliver;
    this.intervalMs = intervalMs;
    this.now = now;
    this.last = -Infinity;
    this.hasPending = false;
    this.pending = undefined;
  }

  /** @param {unknown} value */
  schedule(value) {
    this.pending = value;
    this.hasPending = true;
  }

  /** Deliver the pending value if the interval has elapsed. */
  poll() {
    if (!this.hasPending || this.now() - this.last < this.intervalMs) return;
    this.flush();
  }

  flush() {
    if (!this.hasPending) return;
    const value = this.pending;
    this.hasPending = false;
    this.pending = undefined;
    this.last = this.now();
    this.deliver(value);
  }

  cancel() {
    this.hasPending = false;
    this.pending = undefined;
  }
}

/**
 * Translation metrics appear only while a language is selected.
 * @param {{firstCaptionMs?: number | null, finalLatencyMs?: number | null, rtf?: number | null, translating?: boolean, translateMs?: number | null}} metrics
 */
export function formatMetrics({
  firstCaptionMs,
  finalLatencyMs,
  rtf,
  translating = false,
  translateMs,
} = {}) {
  const ms = (value) =>
    Number.isFinite(value) ? `${Math.round(value)} ms` : '-';
  const factor = Number.isFinite(rtf) ? rtf.toFixed(2) : '-';
  const captions = `First caption: ${ms(firstCaptionMs)} · End of speech to text: ${ms(finalLatencyMs)} · Real-time factor: ${factor}`;
  return translating ? `${captions} · Translate: ${ms(translateMs)}` : captions;
}

/** @param {string} text */
function normalize(text) {
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .trim();
}
