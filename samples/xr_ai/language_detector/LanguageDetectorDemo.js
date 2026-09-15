import * as xb from 'xrblocks';

import {
  LanguageDetectorClient,
  languageName,
} from './LanguageDetectorClient.js';
import {GeminiLiveSource} from './SpeechSources.js';

const MAX_UTTERANCES = 5;
const PLACEHOLDER =
  'Select the microphone and speak in any language. Each completed utterance is detected on this device.';

const LANGUAGE_COLORS = {
  en: '#60a5fa',
  es: '#fbbf24',
  fr: '#a78bfa',
  de: '#f87171',
  it: '#4ade80',
  pt: '#2dd4bf',
  ru: '#fb923c',
  ja: '#fb7185',
  zh: '#facc15',
  ko: '#c084fc',
  ar: '#22d3ee',
  hi: '#a3e635',
};

const FALLBACK_COLORS = [
  '#818cf8',
  '#e879f9',
  '#34d399',
  '#fb923c',
  '#38bdf8',
  '#facc15',
];

function colorForLanguage(code) {
  if (!code) return '#94a3b8';
  const normalized = code.toLowerCase();
  if (LANGUAGE_COLORS[normalized]) return LANGUAGE_COLORS[normalized];
  let hash = 0;
  for (const character of normalized) {
    hash = (hash * 31 + character.charCodeAt(0)) | 0;
  }
  return FALLBACK_COLORS[Math.abs(hash) % FALLBACK_COLORS.length];
}

export class LanguageDetectorDemo extends xb.Script {
  init() {
    this.detector = new LanguageDetectorClient();
    this.source = null;
    this.listening = false;
    this.utterances = [];
    this.interim = '';
    this.interimLanguage = null;
    this.interimTimer = null;

    this.buildUI();
    this.detector
      .load()
      .then(() => this.setStatus('Ready'))
      .catch((error) => {
        console.error('Language detector failed to load:', error);
        this.setStatus('Could not load the on-device detector');
      });
  }

  buildUI() {
    this.itemSlots = Array.from({length: MAX_UTTERANCES}, () => {
      const label = new xb.UIText({
        text: '',
        style: {
          height: 24,
          fontSize: 16,
          fontWeight: 'bold',
        },
      });
      const body = new xb.UIText({
        text: '',
        style: {
          flexGrow: 1,
          fontSize: 24,
          lineHeight: 1.2,
          overflow: 'hidden',
        },
      });
      const panel = new xb.UIPanel({
        style: {
          width: '100%',
          height: 92,
          paddingLeft: 8,
          paddingRight: 8,
          flexDirection: 'column',
          gap: 4,
        },
        children: [label, body],
      });
      return {panel, label, body, live: false};
    });

    const list = new xb.UIPanel({
      style: {
        width: '100%',
        flexGrow: 1,
        flexDirection: 'column',
        justifyContent: 'flex-end',
        gap: 10,
      },
      children: this.itemSlots.map(({panel}) => panel),
    });

    this.statusText = new xb.UIText({
      text: 'Loading the on-device detector…',
      style: {flexGrow: 1, fontSize: 20, opacity: 0.65},
    });
    this.micButton = this.createIconButton(
      'mic',
      'Start listening',
      () => void this.toggleListening()
    );
    this.clearButton = this.createIconButton('delete', 'Clear utterances', () =>
      this.clear()
    );

    const controls = new xb.UIPanel({
      style: {
        width: '100%',
        height: 56,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
      },
      children: [this.statusText, this.micButton, this.clearButton],
    });

    const card = new xb.UICard({
      size: {width: 1.05, height: 0.76},
      manipulation: {
        actions: {
          translate: {faceCamera: true},
          scale: {minScale: 0.7, maxScale: 1.6},
        },
        handle: {action: xb.ManipulationAction.Translate},
      },
      edge: {scale: true},
      children: [
        new xb.UIText({
          text: 'Live Language Detector',
          style: {
            height: 44,
            fontSize: 30,
            fontWeight: 'bold',
          },
        }),
        list,
        controls,
      ],
    });
    card.position.set(0, 1.5, -1.25);
    this.add(card);
    this.renderList();
  }

  createIconButton(icon, ariaLabel, onClick) {
    return new xb.UIButton({
      icon,
      ariaLabel,
      onClick,
      style: {
        width: 56,
        justifyContent: 'center',
        paddingLeft: 0,
        paddingRight: 0,
      },
    });
  }

  async toggleListening() {
    if (this.micButton.disabled) return;
    this.micButton.disabled = true;
    try {
      if (this.listening) {
        await this.stop();
        this.setStatus('Stopped');
        return;
      }
      if (!GeminiLiveSource.isAvailable()) {
        this.setStatus('Add a Gemini API key to start');
        return;
      }

      const source = new GeminiLiveSource();
      source.onTranscript((text, isFinal) =>
        this.handleTranscript(text, isFinal)
      );
      source.onError((error) => {
        console.error('Speech source error:', error);
        this.setStatus(
          `Error: ${error instanceof Error ? error.message : String(error)}`
        );
        this.listening = false;
        this.source = null;
        this.setMicActive(false);
      });

      await source.start();
      this.source = source;
      this.listening = true;
      this.setStatus('Listening…');
      this.setMicActive(true);
    } catch (error) {
      console.error('Failed to start:', error);
      this.setStatus(
        `Could not start: ${error instanceof Error ? error.message : String(error)}`
      );
    } finally {
      this.micButton.disabled = false;
    }
  }

  async stop() {
    const source = this.source;
    this.source = null;
    this.listening = false;
    this.setMicActive(false);
    await source?.stop();
  }

  clear() {
    this.utterances = [];
    this.interim = '';
    this.interimLanguage = null;
    this.source?.reset();
    this.renderList();
  }

  handleTranscript(text, isFinal) {
    if (!text) return;
    if (isFinal) {
      this.utterances.push({...this.detect(text), text});
      this.utterances = this.utterances.slice(-MAX_UTTERANCES);
      this.interim = '';
      this.interimLanguage = null;
      window.clearTimeout(this.interimTimer);
      this.interimTimer = null;
    } else {
      this.interim = text;
      window.clearTimeout(this.interimTimer);
      this.interimTimer = window.setTimeout(() => {
        this.interimLanguage = this.detect(text);
        this.renderList();
      }, 200);
    }
    this.renderList();
  }

  detect(text) {
    if (!this.detector.detector || text.length < 4) {
      return {code: '??', name: 'Detecting', probability: 0};
    }
    const [top] = this.detector.detect(text);
    if (!top) return {code: '??', name: 'Unknown', probability: 0};
    return {
      code: top.languageCode,
      name: languageName(top.languageCode),
      probability: top.probability,
    };
  }

  renderList() {
    const items = this.utterances.slice();
    if (this.interim) {
      items.push({
        ...(this.interimLanguage ?? {
          code: '??',
          name: 'Detecting',
          probability: 0,
        }),
        text: this.interim,
        live: true,
      });
    }
    const visibleItems = items.slice(-MAX_UTTERANCES);
    const firstSlot = MAX_UTTERANCES - visibleItems.length;
    const showPlaceholder = visibleItems.length === 0;

    this.itemSlots.forEach((slot, index) => {
      const item = visibleItems[index - firstSlot];
      if (!item) {
        const isPlaceholder = showPlaceholder && index === MAX_UTTERANCES - 1;
        slot.panel.visible = isPlaceholder;
        slot.panel.style.height = isPlaceholder ? 92 : 0;
        slot.label.text = '';
        slot.body.text = isPlaceholder ? PLACEHOLDER : '';
        slot.label.style.opacity = 1;
        slot.body.style.opacity = isPlaceholder ? 0.65 : 1;
        slot.live = false;
        return;
      }

      slot.panel.visible = true;
      slot.panel.style.height = 92;
      const uncertain =
        item.probability > 0 && item.probability < 0.7 ? ' · uncertain' : '';
      slot.label.text = `${item.name}${item.live ? ' · live' : uncertain}`;
      slot.label.style.color = colorForLanguage(item.code);
      slot.body.style.opacity = 1;
      slot.body.text = item.text;
      slot.live = !!item.live;
    });
  }

  setStatus(message) {
    this.statusText.text = message;
  }

  setMicActive(active) {
    this.micButton.icon = active ? 'stop' : 'mic';
    this.micButton.ariaLabel = active ? 'Stop listening' : 'Start listening';
  }

  dispose() {
    window.clearTimeout(this.interimTimer);
    void this.source?.stop();
    this.detector?.detector?.close?.();
  }
}
