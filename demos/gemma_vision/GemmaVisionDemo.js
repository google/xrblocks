import * as THREE from 'three';
import * as xb from 'xrblocks';

import {GemmaVisionClient} from './GemmaVisionClient.js';
import {MAX_PROMPT_LENGTH, PRESETS, validateQuestion} from './conversation.js';
import {fitSnapshotSize, packSnapshot} from './image.js';
import {markdownText} from './markdown.js';
import {COMPACT_GEMMA_NOTE, createModelChoice} from './modelChoice.js';
import {getModel, MODELS} from './modelConfig.js';
import * as modelStore from './modelStore.js';

const EMPTY_IMAGE =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
const UPDATE_MS = 100;
const EMPTY_METRICS =
  'Time to first text: unavailable · Decode: unavailable · Generated: unavailable';
const NOTE_STYLE = {fontSize: 18, color: '#cbd5e1'};
const CHOICE_COLORS = {selected: '#2563eb', other: '#1e293b'};

/** One retained camera/chat card and client shared with the preload interface. */
export class GemmaVisionDemo extends xb.Script {
  constructor({
    client = new GemmaVisionClient(),
    now = () => performance.now(),
    store = modelStore,
    choice = createModelChoice(),
  } = {}) {
    super();
    this.name = 'Gemma vision demo';
    this.client = client;
    this.now = now;
    this.store = store;
    this.choice = choice;
    this.modelKey = getModel(choice.initial).key;
    /** @type {Map<string, boolean>} Complete-cache state per model key. */
    this.cacheState = new Map();
    this.busy = false;
    this.supported = false;
    this.disposed = false;
    this.messages = [];
    this.textures = new Set();
    this.lastTextUpdate = -Infinity;
    this.lastProgressUpdate = -Infinity;
    this.lastStateUpdate = -Infinity;
    this.previousLoaded = client.loaded;
    this.createPanel();
    this.refreshControls();
  }

  /** The model selected in the chooser, which may differ from the loaded one. */
  get model() {
    return getModel(this.modelKey);
  }

  /** Whether the selected model is fully cached. */
  get cached() {
    return this.cacheState.get(this.modelKey) === true;
  }

  set cached(value) {
    this.cacheState.set(this.modelKey, value === true);
  }

  createPanel() {
    const button = (label, onClick) =>
      new xb.UIButton({label, onClick, style: {flexGrow: 1, fontSize: 22}});
    const row = (children) =>
      new xb.UIPanel({
        style: {flexDirection: 'row', gap: 8, justifyContent: 'center'},
        children,
      });
    const image = (ariaLabel) =>
      new xb.UIImage({
        src: EMPTY_IMAGE,
        ariaLabel,
        pointerEvents: 'none',
        style: {
          width: 240,
          height: 150,
          objectFit: 'contain',
          backgroundColor: '#020617',
          borderRadius: 10,
        },
      });
    this.preview = image('Live camera preview');
    this.thumbnail = image('Frozen image sent to the model');
    this.cameraStatus = new xb.UIText({
      text: 'Camera unavailable. Enter the simulator or a camera-enabled XR session.',
      style: NOTE_STYLE,
    });
    this.status = new xb.UIText({
      text: 'Checking availability. No model download starts automatically.',
      style: NOTE_STYLE,
    });
    this.metrics = new xb.UIText({text: EMPTY_METRICS, style: NOTE_STYLE});
    this.privacy = new xb.UIText({
      text:
        'Camera images, questions, and answers stay on this device. ' +
        'Initial app/runtime/model downloads use the network. ' +
        'Offline questions work while the model remains loaded.',
      style: NOTE_STYLE,
    });
    this.historyText = new xb.UIText({
      text: '',
      style: {
        width: '100%',
        fontSize: 22,
        whiteSpace: 'pre-line',
        lineHeight: 1.3,
      },
    });
    this.history = new xb.UIScrollView({
      ariaLabel: 'Conversation about the captured image',
      style: {height: 220, padding: 12, backgroundColor: '#141c29'},
      children: [this.historyText],
    });
    this.composer = new xb.UITextInput({
      ariaLabel: 'Question about the captured image',
      placeholder: 'Ask about the captured image. Enter sends.',
      maxLength: MAX_PROMPT_LENGTH,
      style: {height: 56, fontSize: 22},
      onSubmit: (value) => this.ask(value),
      onInput: () => this.refreshControls(),
    });
    this.modelButtons = Object.values(MODELS).map((model) => {
      const choice = new xb.UIButton({
        label: model.choiceLabel,
        onClick: () => this.selectModel(model.key),
        style: {flexGrow: 1, flexBasis: 0, fontSize: 22, whiteSpace: 'nowrap'},
      });
      choice.modelKey = model.key;
      return choice;
    });
    this.loadButton = button(this.model.downloadLabel, () =>
      this.loadModel({allowDownload: !this.cached})
    );
    this.captureButton = button('Capture', () => this.capture());
    this.askButton = button('Ask', () => this.ask());
    this.stopButton = button('Stop', () => this.stop());
    this.clearButton = button('Clear conversation', () =>
      this.clearConversation()
    );
    this.presetButtons = PRESETS.map(({label, prompt}) =>
      button(label, () => this.ask(prompt))
    );
    this.buttons = [
      ...this.modelButtons,
      this.loadButton,
      this.captureButton,
      this.askButton,
      this.stopButton,
      this.clearButton,
      ...this.presetButtons,
    ];
    this.card = new xb.UICard({
      size: {width: 1.2, height: 'auto'},
      manipulation: true,
      edge: {scale: true},
      style: {gap: 10, padding: 18, backgroundColor: '#101827ee'},
      children: [
        new xb.UIText({
          text: 'ON-DEVICE VISION · WHAT AM I LOOKING AT?',
          style: {fontSize: 28, fontWeight: 'bold', color: '#f8fafc'},
        }),
        new xb.UIText({
          text: 'Pick a model: Gemma 4 for best quality, Lite for phones and headsets · Chrome/WebGPU',
          style: NOTE_STYLE,
        }),
        row(this.modelButtons),
        this.loadButton,
        this.status,
        row([this.preview, this.thumbnail]),
        new xb.UIText({
          text: 'Live camera (left) · Captured image (right). Presets use the existing capture.',
          style: NOTE_STYLE,
        }),
        this.cameraStatus,
        this.captureButton,
        row(this.presetButtons),
        this.history,
        this.composer,
        row([this.askButton, this.stopButton, this.clearButton]),
        this.metrics,
        this.privacy,
      ],
    });
    this.card.name = 'Gemma vision card';
    this.add(this.card);
  }

  init() {
    if (this.disposed) return Promise.resolve();
    if (this.initializing) return this.initializing;
    this.card.position.set(0, xb.user.height, -1);
    this.camera = xb.core.deviceCamera;
    this.onCameraStateChange = (event) => this.updateCameraState(event);
    this.camera?.addEventListener('statechange', this.onCameraStateChange);
    this.updateCameraState();
    this.initializing = this.checkAvailability();
    return this.initializing;
  }

  async checkAvailability() {
    const operation = this.begin('checking');
    try {
      await this.client.check();
      if (!this.isCurrent(operation)) return;
      this.supported = true;
      for (const model of Object.values(MODELS)) {
        const cached = await this.store.inspectCache(model);
        if (!this.isCurrent(operation)) return;
        this.cacheState.set(model.key, cached.complete === true);
      }
      this.status.text = this.choiceStatus();
    } catch (error) {
      if (this.isCurrent(operation)) {
        this.showError(error, this.supported ? 'Error' : 'Unsupported');
      }
    } finally {
      this.finish(operation);
    }
  }

  choiceStatus() {
    const model = this.model;
    let text;
    if (this.client.loaded && this.client.modelKey === model.key) {
      text = `${model.name} ready. Capture an image to ask a question.`;
    } else {
      text = this.cached
        ? `${model.name} cached. Choose ${model.cachedLabel} when ready.`
        : `${model.name} not loaded. A download starts only when you choose Download.`;
    }
    return this.choice.compact && model.key === 'gemma'
      ? `${text} ${COMPACT_GEMMA_NOTE}`
      : text;
  }

  /** Select a model for the next load; never downloads or loads by itself. */
  selectModel(key) {
    if (!this.canStart() || !Object.hasOwn(MODELS, key)) return;
    if (key === this.modelKey) return;
    this.modelKey = key;
    this.choice.save(key);
    if (this.supported) this.status.text = this.choiceStatus();
    this.refreshControls();
  }

  /** Download permission is captured at the user action, never inferred later. */
  async loadModel({allowDownload = false} = {}) {
    if (
      !this.canStart() ||
      !this.supported ||
      (this.client.loaded && this.client.modelKey === this.modelKey)
    )
      return;
    const operation = this.begin('loading');
    const model = this.model;
    this.loadingModel = model;
    this.storageWarning = '';
    this.pendingProgress = undefined;
    this.progressBytes = new Map();
    this.status.text = 'Checking WebGPU and local model cache…';
    try {
      await this.client.check();
      if (!this.isCurrent(operation)) return;
      const cached = await this.store.inspectCache(model);
      if (!this.isCurrent(operation)) return;
      this.cacheState.set(model.key, cached.complete === true);
      this.loadingCached = cached.complete === true;
      if (!this.loadingCached && !allowDownload) {
        throw new Error(
          'An explicit Download is required; the model cache is incomplete.'
        );
      }
      if (!this.loadingCached) {
        const storage = await this.store.prepareStorage(cached.missingBytes);
        if (!this.isCurrent(operation)) return;
        this.storageWarning = storage.warning ?? '';
      }
      this.status.text = this.withStorageWarning(
        this.loadingCached
          ? 'Loading cached model assets…'
          : 'Downloading model assets…'
      );
      this.lastProgressUpdate = this.now();
      const result = await this.client.load({
        modelKey: model.key,
        allowDownload,
        onProgress: (event) => {
          if (this.isCurrent(operation)) this.recordProgress(event);
        },
      });
      if (!this.isCurrent(operation)) return;
      this.cacheState.set(model.key, result.cached === true);
      this.clearDisplay();
      this.status.text = this.withStorageWarning(
        result.cached === true
          ? `Ready. ${model.name} saved locally; ${
              this.client.imageId === null
                ? 'capture an image to ask a question.'
                : 'ask about the captured image.'
            }`
          : `Loaded for this session; model was not fully saved. ${result.cacheWarning ?? 'Check browser storage.'}`
      );
    } catch (error) {
      if (this.isCurrent(operation)) this.showError(error);
    } finally {
      if (!this.disposed && operation.canceled) {
        this.status.text =
          'Model loading canceled. Choose Download or Load cached to retry.';
      }
      this.pendingProgress = undefined;
      this.finish(operation);
    }
  }

  recordProgress(event) {
    const model = this.loadingModel;
    const expected = Object.hasOwn(model.files, event?.file)
      ? model.files[event.file]
      : undefined;
    if (!expected) return;
    const loaded =
      event.status === 'done'
        ? expected
        : Number.isFinite(event.loaded)
          ? Math.min(expected, Math.max(0, event.loaded))
          : 0;
    this.progressBytes.set(
      event.file,
      Math.max(this.progressBytes.get(event.file) ?? 0, loaded)
    );
    const bytes = [...this.progressBytes.values()].reduce((a, b) => a + b, 0);
    const percent = Math.floor((bytes / model.bytes) * 100);
    const size =
      model.bytes >= 1e9
        ? `${(model.bytes / 1e9).toFixed(2)} GB`
        : `${Math.round(model.bytes / 1e6)} MB`;
    this.pendingProgress = this.withStorageWarning(
      bytes === model.bytes
        ? `Model assets ready. Compiling and initializing ${model.name}…`
        : `${this.loadingCached ? 'Loading cached assets' : 'Downloading/loading assets'}: ${percent}% of ${size}${this.loadingCached ? '' : ' (includes cache reads)'}`
    );
    this.flushProgress();
  }

  withStorageWarning(text) {
    return this.storageWarning ? `${text} ${this.storageWarning}` : text;
  }

  flushProgress() {
    if (
      this.pendingProgress === undefined ||
      this.now() - this.lastProgressUpdate < UPDATE_MS
    )
      return;
    if (this.status.text !== this.pendingProgress) {
      this.status.text = this.pendingProgress;
    }
    this.pendingProgress = undefined;
    this.lastProgressUpdate = this.now();
  }

  updateCameraState(event) {
    if (this.disposed) return;
    const state = event?.state ?? this.camera?.state;
    if (state === 'streaming') {
      this.preview.src = this.camera.texture;
      const device = event?.device ?? this.camera.getCurrentDevice?.();
      const simulated = device
        ? device.groupId === 'simulator'
        : this.camera.simulatorCamera && !this.camera.isUsingXRCameraAccess;
      this.cameraStatus.text = simulated
        ? 'Simulator camera live. Capture freezes this view.'
        : 'Device camera live. Capture freezes this view.';
    } else {
      this.preview.src = EMPTY_IMAGE;
      const error = event?.error ?? event?.details?.error;
      this.cameraStatus.text = error
        ? `Camera ${state}: ${error.message ?? String(error)}`
        : `Camera ${state ?? 'unavailable'}. Waiting for a live frame; enter the simulator or a camera-enabled XR session.`;
    }
    this.refreshControls();
  }

  async capture() {
    if (!this.canStart() || !this.supported) return;
    if (this.camera?.state !== 'streaming') {
      this.status.text =
        'Camera unavailable. Wait for a live frame before Capture.';
      return;
    }
    const operation = this.begin('capturing');
    this.status.text = 'Capturing the current camera image…';
    let texture;
    try {
      const size = fitSnapshotSize(this.camera.width, this.camera.height);
      const snapshot = await this.camera.captureSnapshot({
        outputFormat: 'imageData',
        ...size,
      });
      if (!this.isCurrent(operation)) return;
      if (!snapshot)
        throw new Error('Capture failed: no camera frame was returned.');
      const canvas = document.createElement('canvas');
      canvas.width = snapshot.width;
      canvas.height = snapshot.height;
      const context = canvas.getContext('2d');
      if (!context)
        throw new Error('Could not create the captured-image thumbnail.');
      context.putImageData(snapshot, 0, 0);
      texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      texture.minFilter = THREE.LinearFilter;
      texture.magFilter = THREE.LinearFilter;
      this.textures.add(texture);
      await this.client.setImage(packSnapshot(snapshot));
      if (!this.isCurrent(operation)) return;
      const previous = this.thumbnailTexture;
      this.thumbnail.src = texture;
      this.thumbnailTexture = texture;
      this.releaseTexture(previous);
      this.clearDisplay();
      this.status.text = this.client.loaded
        ? 'Image captured. Ask a question or choose a preset.'
        : 'Image captured. Load a model before asking a question.';
    } catch (error) {
      if (this.isCurrent(operation)) this.showError(error);
    } finally {
      if (texture !== this.thumbnailTexture) this.releaseTexture(texture);
      this.finish(operation);
    }
  }

  async ask(question = this.composer.value) {
    if (!this.canStart()) return;
    if (
      !this.supported ||
      !this.client.loaded ||
      this.client.imageId === null
    ) {
      this.status.text =
        'Load a model and capture an image before asking a question.';
      return;
    }
    try {
      question = validateQuestion(question);
    } catch (error) {
      this.showError(error);
      return;
    }
    const operation = this.begin('generating');
    const model = getModel(this.client.modelKey);
    const response = {
      question,
      answer: '',
      state: 'generating',
      speaker: model.name,
    };
    this.messages.push(response);
    this.response = response;
    this.pendingText = undefined;
    this.renderTranscript();
    this.composer.value = '';
    this.metrics.text =
      'Time to first text: pending · Decode: pending · Generated: pending';
    this.status.text = 'Generating locally from the captured image…';
    let acceptingText = true;
    try {
      const result = await this.client.generate(question, {
        imageBudget: model.imageBudget,
        onText: (text) => {
          if (acceptingText && this.isCurrent(operation))
            this.pendingText = text;
        },
      });
      if (!this.isCurrent(operation)) return;
      response.state = result.interrupted
        ? 'interrupted'
        : result.truncated
          ? 'truncated'
          : 'completed';
      this.pendingText = result.text ?? '';
      this.flushText();
      this.showMetrics(result);
      this.status.text = result.interrupted
        ? 'Interrupted. Partial reply is visible but not added to model history.'
        : result.truncated
          ? 'Output limit reached. The transcription or answer may be incomplete.'
          : 'Ready. Ask a follow-up about the same captured image.';
    } catch (error) {
      if (this.isCurrent(operation)) {
        response.state = 'failed';
        this.pendingText ??= response.answer;
        this.flushText();
        this.showError(error);
      }
    } finally {
      acceptingText = false;
      this.finish(operation);
    }
  }

  showMetrics(result) {
    const first = Number.isFinite(result.firstTextMs)
      ? `${Math.round(result.firstTextMs)} ms`
      : 'unavailable';
    const rate = Number.isFinite(result.tokensPerSecond)
      ? `${result.tokensPerSecond.toFixed(1)} tokens/s`
      : 'unavailable';
    const count =
      Number.isInteger(result.generatedTokens) && result.generatedTokens >= 0
        ? `${result.generatedTokens} tokens`
        : 'unavailable';
    this.metrics.text = `Time to first text: ${first} · Decode: ${rate} · Generated: ${count}`;
  }

  async stop() {
    if (this.disposed || this.stopping || this.stopButton.disabled) return;
    this.stopping = true;
    if (this.operation?.type === 'loading') this.operation.canceled = true;
    this.status.text =
      this.operation?.type === 'loading'
        ? 'Canceling model loading…'
        : 'Stopping generation… GPU prefill may take time to stop.';
    this.refreshControls();
    try {
      await this.client.stop();
    } catch (error) {
      if (!this.disposed) this.showError(error);
    } finally {
      this.stopping = false;
      this.refreshControls();
    }
  }

  async clearConversation() {
    if (!this.canStart() || !this.client.loaded) return;
    const operation = this.begin('clearing');
    try {
      await this.client.clear();
      if (!this.isCurrent(operation)) return;
      this.clearDisplay();
      this.status.text =
        'Conversation cleared. Model and captured image remain available.';
    } catch (error) {
      if (this.isCurrent(operation)) this.showError(error);
    } finally {
      this.finish(operation);
    }
  }

  clearDisplay() {
    this.messages.length = 0;
    this.response = undefined;
    this.pendingText = undefined;
    this.pendingBottom = undefined;
    this.historyText.text = '';
    this.history.scrollTo(0);
    this.metrics.text = EMPTY_METRICS;
  }

  renderTranscript() {
    if (
      !this.pendingBottom &&
      this.history.maxScrollTop - this.history.scrollTop < 16
    ) {
      this.pendingBottom = {
        height: this.history.scrollHeight,
        offset: this.history.scrollTop,
      };
    }
    this.historyText.text = this.messages
      .map(({question, answer, state, speaker}) => {
        const display = markdownText(answer).replace(/^ +/gm, (spaces) =>
          '\u00a0'.repeat(spaces.length)
        );
        const suffix =
          {
            interrupted: '\n[Interrupted]',
            truncated: '\n[Output limit reached]',
            failed: '\n[Failed; partial reply not added to model history]',
          }[state] ?? '';
        return `You\n${question}\n\n${speaker}\n${display || (state === 'generating' ? '…' : '')}${suffix}`;
      })
      .join('\n\n');
    this.lastTextUpdate = this.now();
  }

  flushText() {
    if (this.pendingText === undefined || !this.response) return;
    this.response.answer = this.pendingText;
    this.pendingText = undefined;
    this.renderTranscript();
  }

  update() {
    if (this.disposed) return;
    const now = this.now();
    if (now - this.lastTextUpdate >= UPDATE_MS) this.flushText();
    this.flushProgress();
    if (this.pendingBottom && this.history.ready) {
      if (this.history.scrollTop !== this.pendingBottom.offset) {
        this.pendingBottom = undefined;
      } else if (this.history.scrollHeight !== this.pendingBottom.height) {
        this.history.scrollTo(this.history.maxScrollTop);
        this.pendingBottom = undefined;
      }
    }
    if (now - this.lastStateUpdate >= UPDATE_MS) {
      this.lastStateUpdate = now;
      if (this.composer.error && this.composer.error !== this.lastInputError) {
        this.showError(
          new Error(`Text input unavailable: ${this.composer.error.message}`)
        );
      }
      this.lastInputError = this.composer.error;
      this.refreshControls();
    }
  }

  refreshControls() {
    const busy =
      this.busy ||
      this.stopping ||
      ['loading', 'generating'].includes(this.client.state);
    const unavailable = this.disposed || !this.supported;
    const hasImage = this.client.imageId !== null;
    const canAsk = !unavailable && !busy && this.client.loaded && hasImage;
    const model = this.model;
    const selectedLoaded =
      this.client.loaded && this.client.modelKey === model.key;
    const label = this.cached ? model.cachedLabel : model.downloadLabel;
    if (this.loadButton.label !== label) this.loadButton.label = label;
    this.loadButton.disabled = unavailable || busy || selectedLoaded;
    for (const choice of this.modelButtons) {
      const selected = choice.modelKey === model.key;
      const color = selected ? CHOICE_COLORS.selected : CHOICE_COLORS.other;
      if (choice.style.backgroundColor !== color) {
        choice.style.backgroundColor = color;
      }
      const ariaLabel = `${choice.label}${selected ? ', selected' : ''}`;
      if (choice.ariaLabel !== ariaLabel) choice.ariaLabel = ariaLabel;
      choice.disabled = this.disposed || busy;
    }
    this.captureButton.disabled =
      unavailable || busy || this.camera?.state !== 'streaming';
    this.askButton.disabled =
      !canAsk ||
      !this.composer.ready ||
      !!this.composer.error ||
      !this.composer.value.trim() ||
      this.composer.value.trim().length > MAX_PROMPT_LENGTH;
    this.composer.disabled = unavailable || busy;
    this.clearButton.disabled = unavailable || busy || !this.client.loaded;
    const presets = this.client.loaded
      ? getModel(this.client.modelKey).presets
      : [];
    PRESETS.forEach(({id}, index) => {
      this.presetButtons[index].disabled = !canAsk || !presets.includes(id);
    });
    this.stopButton.disabled =
      this.disposed ||
      !!this.stopping ||
      !(
        ['loading', 'generating'].includes(this.operation?.type) ||
        ['loading', 'generating'].includes(this.client.state)
      );
    if (!this.disposed && this.previousLoaded && !this.client.loaded && !busy) {
      const error = this.status.text.startsWith('Error:')
        ? this.status.text
        : 'Model unloaded.';
      this.status.text = `${error} Load a model again and capture a new image.`;
    }
    this.previousLoaded = this.client.loaded;
  }

  canStart() {
    return (
      !this.disposed &&
      !this.busy &&
      !this.stopping &&
      !['loading', 'generating'].includes(this.client.state)
    );
  }

  begin(type) {
    this.operation = {type, canceled: false};
    this.busy = true;
    this.refreshControls();
    return this.operation;
  }

  isCurrent(operation) {
    return (
      !this.disposed && this.operation === operation && !operation.canceled
    );
  }

  finish(operation) {
    if (this.operation !== operation) return;
    this.operation = undefined;
    this.busy = false;
    this.refreshControls();
  }

  showError(error, prefix = 'Error') {
    console.error('Gemma vision demo:', error);
    if (!this.disposed)
      this.status.text = `${prefix}: ${error.message ?? String(error)}`;
  }

  releaseTexture(texture) {
    if (this.textures.delete(texture)) texture.dispose();
  }

  dispose() {
    if (this.disposing) return this.disposing;
    this.disposed = true;
    if (this.operation) this.operation.canceled = true;
    this.camera?.removeEventListener('statechange', this.onCameraStateChange);
    this.pendingText = undefined;
    this.pendingProgress = undefined;
    this.pendingBottom = undefined;
    this.composer.onSubmit = undefined;
    this.composer.onInput = undefined;
    for (const button of this.buttons) button.onClick = undefined;
    for (const texture of this.textures) this.releaseTexture(texture);
    this.thumbnailTexture = undefined;
    this.refreshControls();
    this.clear();
    this.disposing = Promise.resolve()
      .then(() => this.client.dispose())
      .catch((error) => {
        this.showError(error);
      });
    return this.disposing;
  }
}
