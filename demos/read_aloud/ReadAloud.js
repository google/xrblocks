import * as xb from 'xrblocks';

import {OCR_PROMPT, parseOcrResponse} from './ocr.js';
import {ChunkPlayer} from './playback.js';
import {DEFAULT_SERVER_URL, RemoteTts} from './remote-tts.js';

const EMPTY_IMAGE =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
const MAX_SHOWN_CHARS = 420;
const CAMERA_STATE_LABELS = {
  initializing: 'Starting camera…',
  no_devices_found: 'No camera found.',
  error: 'Camera failed to start.',
};

/**
 * Press Read: a device-camera photo goes to Gemini (or, with `?ocr=ollama`,
 * to a local Ollama vision model through the laptop server), which
 * transcribes the text and translates it to English when the page is in
 * another language. The English text is spoken by Matcha-TTS running on the
 * tethered laptop (`server/server.py`). Stop cancels playback. Falls back to
 * the browser's speech synthesis when the server is unreachable.
 */
export class ReadAloud extends xb.Script {
  static dependencies = {ai: xb.AI, deviceCamera: xb.XRDeviceCamera};

  remote = null;
  player = null;
  mode = 'loading'; // 'loading' | 'server' | 'native' | 'failed'
  ocrBackend = 'gemini'; // 'gemini' | 'ollama'
  busy = false;
  speaking = false;
  generator = null;
  frozenTexture = null;
  readyLabel = 'Ready.';

  init({ai, deviceCamera}) {
    this.ai = ai;
    this.deviceCamera = deviceCamera;
    this.params = new URLSearchParams(location.search);
    this.serverUrl = this.params.get('server') || DEFAULT_SERVER_URL;
    this.ocrBackend = this.params.get('ocr') === 'ollama' ? 'ollama' : 'gemini';

    this.thumbnail = new xb.UIImage({
      src: EMPTY_IMAGE,
      ariaLabel: 'Last captured page',
      style: {
        width: 200,
        height: 150,
        flexShrink: 0,
        objectFit: 'cover',
        borderRadius: 12,
        backgroundColor: '#111111',
      },
    });
    this.extractedText = new xb.UIText({
      text: 'The text read from the page appears here.',
      style: {
        flexGrow: 1,
        fontSize: 14,
        lineHeight: 1.3,
        whiteSpace: 'pre-line',
        opacity: 0.85,
      },
    });
    this.statusText = new xb.UIText({
      text: 'Connecting to the laptop server…',
      style: {fontSize: 15, lineHeight: 1.35, whiteSpace: 'pre-line'},
    });
    this.readButton = new xb.UIButton({
      label: 'Read',
      icon: 'photo_camera',
      disabled: true,
      style: {flexGrow: 1},
      onClick: () => void this.read(),
    });
    this.stopButton = new xb.UIButton({
      label: 'Stop',
      icon: 'stop',
      disabled: true,
      style: {flexGrow: 1},
      onClick: () => this.stop(),
    });
    const card = new xb.UICard({
      size: {width: 0.62, height: 'auto'},
      manipulation: true,
      edge: true,
      style: {flexDirection: 'column', gap: 12, padding: 18},
      children: [
        new xb.UIText({
          text: 'Read Aloud',
          style: {fontSize: 26, fontWeight: 'bold'},
        }),
        new xb.UIText({
          text: 'Hold a page in front of you and click Read. The text is extracted and spoken by Matcha-TTS on the tethered laptop. Click Stop to stop.',
          style: {fontSize: 14, lineHeight: 1.35, opacity: 0.8},
        }),
        new xb.UIPanel({
          style: {flexDirection: 'row', gap: 12, alignItems: 'flex-start'},
          children: [this.thumbnail, this.extractedText],
        }),
        this.statusText,
        new xb.UIPanel({
          style: {flexDirection: 'row', gap: 10},
          children: [this.readButton, this.stopButton],
        }),
      ],
    });
    card.position.set(0, xb.user.height, -1.2);
    this.add(card);

    this.onCameraState = (event) => this.updateCameraState(event.state);
    this.deviceCamera?.addEventListener('statechange', this.onCameraState);

    void this.boot();
  }

  status(text) {
    this.statusText.text = text;
  }

  updateCameraState(state) {
    if (this.busy || this.speaking || this.mode === 'loading') return;
    const label = CAMERA_STATE_LABELS[state];
    if (label) this.status(label);
  }

  // ----------------------------------------------------------------- boot

  async boot() {
    this.mode = 'loading';
    this.readButton.disabled = true;
    const forceNative = this.params.get('native') === '1';
    try {
      this.player = new ChunkPlayer(xb.core.sound.getAudioListener());
      this.remote = new RemoteTts(this.serverUrl, this.player.context);
      const nativeVoice = xb.core.sound.speechSynthesizer;

      let engineLabel;
      if (forceNative) {
        this.mode = 'native';
        engineLabel = 'Using the browser voice (?native=1).';
      } else {
        this.status(`Connecting to the laptop server at ${this.serverUrl}…`);
        try {
          await this.remote.connect();
          this.mode = 'server';
          engineLabel = `Ready · Matcha-TTS on the laptop (${this.remote.describe()})`;
        } catch (error) {
          if (!nativeVoice) throw error;
          this.mode = 'native';
          engineLabel =
            `Laptop server not reachable at ${this.serverUrl} ` +
            `(${describeError(error)}) — using the browser voice.`;
        }
      }
      if (this.ocrBackend === 'ollama') {
        const ocr = this.remote.health?.ocr ?? {};
        if (!ocr.ollamaAvailable) {
          engineLabel +=
            '\nOCR: Ollama requested but the server reports it is not running.';
        } else if (ocr.ollamaVision === false) {
          engineLabel += `\nOCR: Ollama ${ocr.ollamaModel} cannot read images — start the server with a vision model (--ollama-model).`;
        } else if (ocr.ollamaVision === null) {
          engineLabel += `\nOCR: Ollama ${ocr.ollamaModel} is not pulled on the laptop.`;
        } else {
          engineLabel += `\nOCR: Ollama ${ocr.ollamaModel} via the laptop.`;
        }
      }
      this.readyLabel = `${engineLabel}\nClick Read to read a page.`;
      this.status(this.readyLabel);
      this.readButton.disabled = false;

      const text = this.params.get('text');
      if (text) await this.speak(text);
    } catch (error) {
      this.mode = 'failed';
      this.status(
        `Failed to start: ${describeError(error)}\nPress Read to retry.`
      );
      this.readButton.disabled = false;
    }
  }

  // ----------------------------------------------------------------- read

  async read() {
    if (this.busy || this.mode === 'loading') return;
    if (this.mode === 'failed') {
      void this.boot();
      return;
    }
    const useOllama = this.ocrBackend === 'ollama';
    if (!useOllama && !this.ai?.isAvailable()) {
      this.status(
        'Add a Gemini API key (?key= in the URL or keys.json) to read pages, or use ?ocr=ollama.'
      );
      return;
    }
    if (useOllama && this.mode !== 'server') {
      this.status('Ollama OCR needs the laptop server; it is not connected.');
      return;
    }
    const camera = this.deviceCamera;
    if (!camera) {
      this.status('Device camera is not enabled.');
      return;
    }
    this.busy = true;
    this.readButton.disabled = true;
    try {
      this.stop();
      this.status('Capturing…');
      // The hidden video element is throttled inside an immersive session;
      // wait for a fresh frame so the snapshot is not stale.
      await camera.waitForFreshFrame?.();
      const snapshot = await camera.getSnapshot({
        outputFormat: 'base64',
        mimeType: 'image/jpeg',
        quality: 0.85,
      });
      if (!snapshot) {
        this.status(
          camera.isUsingXRCameraAccess
            ? 'Camera frames are only available as a GPU texture on this device — snapshots are unsupported.'
            : `Camera not ready (${CAMERA_STATE_LABELS[camera.state] ?? camera.state}).`
        );
        return;
      }
      this.showThumbnail(camera.getSnapshot({outputFormat: 'texture'}));

      const {strippedBase64, mimeType} = xb.parseBase64DataURL(snapshot);
      let raw;
      if (useOllama) {
        this.status(
          `Reading the page with ${this.remote.health.ocr.ollamaModel} on the laptop…`
        );
        raw = (
          await this.remote.ocr(strippedBase64, mimeType, {
            prompt: OCR_PROMPT,
            json: true,
          })
        ).text;
      } else {
        this.status('Reading the page with Gemini…');
        const response = await this.ai.query({
          type: 'multiPart',
          parts: [
            {inlineData: {mimeType, data: strippedBase64}},
            {text: OCR_PROMPT},
          ],
        });
        raw = (
          typeof response === 'string' ? response : response?.text
        )?.trim();
      }
      const page = parseOcrResponse(raw);
      if (!page.english) {
        this.extractedText.text = '(no readable text in this photo)';
        this.status(`No text found.\n${this.readyLabel}`);
        return;
      }
      const shown =
        page.english.length > MAX_SHOWN_CHARS
          ? page.english.slice(0, MAX_SHOWN_CHARS) + '…'
          : page.english;
      this.extractedText.text = page.translated
        ? `[${page.language} → English]\n${shown}`
        : shown;
      await this.speak(page.english, {
        note: page.translated ? `Translated from ${page.language} · ` : '',
      });
    } catch (error) {
      this.status(`Failed: ${describeError(error)}`);
    } finally {
      this.busy = false;
      this.readButton.disabled = false;
    }
  }

  showThumbnail(texture) {
    if (!texture) return;
    const previous = this.frozenTexture;
    this.frozenTexture = texture;
    this.thumbnail.src = texture;
    previous?.dispose();
  }

  // ---------------------------------------------------------------- speak

  /** Speaks `text`; `note` is prefixed to the progress line (translation). */
  async speak(text, {note = ''} = {}) {
    this.speaking = true;
    this.stopButton.disabled = false;
    try {
      if (this.mode === 'native') {
        this.status(`${note}Speaking (browser voice)…`);
        await xb.core.sound.speechSynthesizer.speak(text);
        this.status(`Done.\n${this.readyLabel}`);
        return;
      }
      await this.player.resume();
      const steps = Number(this.params.get('steps')) || undefined;
      const totals = {decoder: 0, vocoder: 0, total: 0};
      let audioSeconds = 0;
      const generator = this.remote.speak(text, {steps});
      this.generator = generator;
      for await (const item of generator) {
        if (this.generator !== generator) return; // stopped
        this.player.enqueue(item.buffer);
        audioSeconds += item.buffer.duration;
        for (const key in totals) totals[key] += item.timings[key] ?? 0;
        this.status(
          `${note}Speaking ${item.index + 1}/${item.count} · ` +
            `decoder ${totals.decoder.toFixed(0)} ms · vocoder ${totals.vocoder.toFixed(0)} ms · ` +
            `RTF ${(totals.total / 1000 / audioSeconds).toFixed(2)}`
        );
      }
      if (this.generator !== generator) return;
      await this.player.whenDone();
      if (this.generator === generator) {
        this.status(
          `Done · ${audioSeconds.toFixed(1)} s of audio\n${this.readyLabel}`
        );
      }
    } catch (error) {
      this.status(`Speech failed: ${describeError(error)}`);
    } finally {
      this.speaking = false;
      this.generator = null;
      this.stopButton.disabled = true;
    }
  }

  stop() {
    const wasSpeaking = this.speaking;
    this.generator = null;
    this.player?.stop();
    xb.core.sound?.speechSynthesizer?.cancel();
    this.speaking = false;
    this.stopButton.disabled = true;
    if (wasSpeaking && !this.busy) this.status(`Stopped.\n${this.readyLabel}`);
  }

  dispose() {
    this.stop();
    this.deviceCamera?.removeEventListener('statechange', this.onCameraState);
    this.frozenTexture?.dispose();
    this.frozenTexture = null;
  }
}

function describeError(error) {
  if (error instanceof Error) return error.message;
  return String(error);
}
