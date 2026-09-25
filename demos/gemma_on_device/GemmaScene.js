import * as THREE from 'three';
import * as xb from 'xrblocks';
import {Keyboard} from 'xrblocks/addons/virtualkeyboard/index.js';

import {GemmaClient, MAX_PROMPT_LENGTH} from './GemmaClient.js';
import {MODEL_BYTES, downloadModel, hasCachedModel} from './modelStore.js';

const TEXT_UPDATE_MS = 100;
const BOTTOM_TOLERANCE = 8;

export function compactSceneContext(tree, objects, selected) {
  if (!tree?.nodes) throw new Error('Scene semantic context is unavailable.');
  const ownedIds = new Set(objects.map((object) => object.id));
  const nodes = Object.values(tree.nodes).filter((node) =>
    ownedIds.has(node.objectId)
  );
  return {
    selectedId:
      nodes.find((node) => node.objectId === selected?.id)?.id ?? null,
    objects: nodes.map((node) => ({
      id: node.id,
      name: node.name,
      type:
        objects.find((object) => object.id === node.objectId).shape ??
        node.type ??
        node.role,
      position: [...node.position],
      ...(node.bounds
        ? {
            bounds: {
              center: [...node.bounds.center],
              size: [...node.bounds.size],
            },
          }
        : {}),
    })),
  };
}

class SceneObject extends xb.MeshScript {
  constructor(name, shape, geometry, color, onChoose) {
    super(geometry, new THREE.MeshStandardMaterial({color, roughness: 0.45}));
    this.name = name;
    this.shape = shape;
    this.xb = {manipulation: true};
    this.onChoose = onChoose;
  }

  onObjectSelectStart(event) {
    this.onChoose?.(this);
    event.stopPropagation();
  }

  onObjectTouchStart(event) {
    this.onObjectSelectStart(event);
  }

  onObjectSelectEnd(event) {
    event.stopPropagation();
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.onChoose = undefined;
    this.geometry.dispose();
    this.material.dispose();
  }
}

export class GemmaScene extends xb.Script {
  static dependencies = {context: xb.Context};

  constructor({createWorker} = {}) {
    super();
    this.createWorker = createWorker;
    this.objects = [];
    this.selected = null;
    this.disposed = false;
    this.busy = false;
    this.cached = false;
    this.lastTextUpdate = -Infinity;
  }

  async init({context} = {}) {
    this.context = context;
    this.createObjects();
    this.createPanel();
    this.client = new GemmaClient({
      createWorker: this.createWorker,
      onState: (state) => {
        if (this.disposed) return;
        if (state === 'error' && !this.busy) {
          this.status.text =
            'Model error. Try New chat; reload the page if the GPU was lost.';
        }
        this.refreshControls();
      },
    });

    const missing = [
      !globalThis.isSecureContext && 'secure context (HTTPS or localhost)',
      !globalThis.navigator?.gpu && 'WebGPU',
      !globalThis.caches && 'Cache API',
      typeof globalThis.Worker !== 'function' && 'Worker support',
    ].filter(Boolean);
    this.supported = missing.length === 0;
    if (!this.supported) {
      this.status.text = `Unsupported: requires ${missing.join(', ')}. Use desktop Chrome.`;
      this.refreshControls();
      return;
    }
    this.busy = true;
    this.refreshControls();
    try {
      const cached = await hasCachedModel();
      if (this.disposed) return;
      this.cached = cached;
      this.status.text = cached
        ? 'Model cached. Load it when you are ready.'
        : 'Model not loaded. Download only starts when you choose Download.';
    } catch (error) {
      this.showError(error);
    } finally {
      this.busy = false;
      this.refreshControls();
    }
  }

  createObjects() {
    const choose = (object) => {
      if (this.disposed) return;
      this.selected = object;
      for (const item of this.objects) {
        item.material.emissive.set(item === object ? 0x554422 : 0x000000);
      }
      this.selectionLabel.text = `Selected: ${object.name}. Drag to move; selection does not send a prompt.`;
    };
    this.objects = [
      new SceneObject(
        'Amber cube',
        'cube',
        new THREE.BoxGeometry(0.2, 0.2, 0.2),
        0xfbbc04,
        choose
      ),
      new SceneObject(
        'Blue sphere',
        'sphere',
        new THREE.SphereGeometry(0.11, 24, 16),
        0x4285f4,
        choose
      ),
      new SceneObject(
        'Green cylinder',
        'cylinder',
        new THREE.CylinderGeometry(0.09, 0.09, 0.23, 24),
        0x34a853,
        choose
      ),
    ];
    this.objects.forEach((object, index) => {
      object.position.set((index - 1) * 0.32, 0.92, -1.15);
      this.add(object);
    });
    this.add(new THREE.HemisphereLight(0xffffff, 0x596477, 3));
  }

  createPanel() {
    const noteStyle = {fontSize: 16, lineHeight: 1.3};
    this.status = new xb.UIText({
      text: 'Checking local model cache…',
      style: {fontSize: 19, color: '#b9e8d3'},
    });
    this.selectionLabel = new xb.UIText({
      text: 'Selected: none. Select or drag an object below.',
      style: noteStyle,
    });
    this.contextLabel = new xb.UIText({
      text: 'Scene metadata, not camera vision. A fresh snapshot is taken only on Send.',
      style: noteStyle,
    });
    this.metrics = new xb.UIText({
      text: 'Time to first text: unavailable · Decode: unavailable',
      style: noteStyle,
    });
    this.history = new xb.UIScrollView({
      ariaLabel: 'Local Gemma conversation',
      style: {height: 220, gap: 10, backgroundColor: '#141c29', padding: 12},
    });
    this.composer = new xb.UITextInput({
      ariaLabel: 'Prompt for on-device Gemma',
      placeholder: 'Ask about these objects. Enter sends.',
      maxLength: MAX_PROMPT_LENGTH,
      style: {height: 56, fontSize: 22},
      onSubmit: () => this.send(),
      onInput: () => this.refreshControls(),
    });
    this.keyboard = new Keyboard({input: this.composer, open: false});
    this.keyboardToggle = new xb.UIButton({
      label: 'Show keyboard',
      onClick: () => {
        if (this.disposed || this.keyboardToggle.disabled) return;
        this.keyboard.open = !this.keyboard.open;
        this.keyboardToggle.label = this.keyboard.open
          ? 'Hide keyboard'
          : 'Show keyboard';
      },
    });
    this.keyboardToggle.xb.preserveTextFocus = true;
    this.loadButton = new xb.UIButton({
      label: 'Download Gemma 4 (~2 GB)',
      onClick: () => this.loadModel(),
    });
    this.sendButton = new xb.UIButton({
      label: 'Send',
      onClick: () => this.send(),
    });
    this.stopButton = new xb.UIButton({
      label: 'Stop',
      onClick: () => this.stop(),
    });
    this.newChatButton = new xb.UIButton({
      label: 'New chat',
      onClick: () => this.newChat(),
    });
    this.presetButtons = [
      [
        'Describe selected',
        'Describe the selected object using the scene metadata.',
      ],
      [
        'Compare objects',
        'Compare the positions and sizes of the three objects.',
      ],
    ].map(
      ([label, prompt]) =>
        new xb.UIButton({
          label,
          style: {flexGrow: 1},
          onClick: () => {
            if (this.disposed || this.busy) return;
            this.composer.value = prompt;
            this.refreshControls();
          },
        })
    );
    this.panel = new xb.UICard({
      size: {width: 0.98, height: 'auto'},
      manipulation: true,
      edge: true,
      style: {
        flexDirection: 'column',
        gap: 10,
        padding: 18,
        backgroundColor: '#202a39',
      },
      children: [
        new xb.UIText({
          text: 'Gemma 4 · On-device scene assistant',
          style: {fontSize: 28, fontWeight: 'bold'},
        }),
        new xb.UIText({
          text: '~2 GB download/disk · ~4 GB free RAM recommended. Desktop Chrome primary; headsets untested.',
          style: noteStyle,
        }),
        new xb.UIText({
          text: 'Prompts and inference stay on this device. Only the model is cached; offline page reload is not guaranteed.',
          style: noteStyle,
        }),
        this.loadButton,
        this.status,
        this.selectionLabel,
        this.contextLabel,
        this.history,
        this.composer,
        new xb.UIPanel({
          style: {flexDirection: 'row', gap: 10},
          children: this.presetButtons,
        }),
        new xb.UIPanel({
          style: {flexDirection: 'row', gap: 10},
          children: [
            this.sendButton,
            this.stopButton,
            this.newChatButton,
            this.keyboardToggle,
          ],
        }),
        this.metrics,
        new xb.UIText({
          text: 'Panel keyboard optional; native-keyboard suppression is best effort. Chat is not saved across reloads.',
          style: {fontSize: 14},
        }),
        this.keyboard,
      ],
    });
    this.panel.name = 'Gemma chat panel';
    this.panel.position.set(0, 1.65, -0.75);
    this.add(this.panel);
  }

  refreshControls() {
    if (this.disposed || !this.client) return;
    const busy =
      this.busy ||
      ['loading', 'generating', 'resetting'].includes(this.client.state);
    const validPrompt =
      !!this.composer.value.trim() &&
      this.composer.value.length <= MAX_PROMPT_LENGTH;
    const loadLabel = this.cached
      ? 'Load cached Gemma 4'
      : 'Download Gemma 4 (~2 GB)';
    if (this.loadButton.label !== loadLabel) this.loadButton.label = loadLabel;
    this.loadButton.disabled = !this.supported || busy || this.client.loaded;
    this.sendButton.disabled =
      !this.supported ||
      busy ||
      this.client.state !== 'ready' ||
      this.client.needsNewChat ||
      !this.composer.ready ||
      !!this.composer.error ||
      !validPrompt;
    const stopLabel = this.downloadController ? 'Cancel download' : 'Stop';
    if (this.stopButton.label !== stopLabel) this.stopButton.label = stopLabel;
    this.stopButton.disabled =
      !this.downloadController && this.client.state !== 'generating';
    this.newChatButton.disabled = busy || !this.client.loaded;
    this.composer.disabled = busy || !this.supported;
    this.keyboardToggle.disabled = busy || !this.supported;
    for (const button of this.presetButtons)
      button.disabled = busy || !this.supported;
  }

  async loadModel() {
    if (this.disposed || !this.supported || this.busy || this.client.loaded)
      return;
    this.busy = true;
    this.status.text = 'Checking WebGPU adapter before any model download…';
    this.refreshControls();
    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (this.disposed) return;
      if (!adapter)
        throw new Error(
          'No usable WebGPU adapter. Try desktop Chrome with hardware acceleration.'
        );
      this.cached = await hasCachedModel();
      if (this.disposed) return;
      if (!this.cached) {
        const controller = new AbortController();
        this.downloadController = controller;
        let lastProgressUpdate = -Infinity;
        let lastPhase;
        this.status.text = 'Downloading Gemma 4 (~2 GB)…';
        this.refreshControls();
        await downloadModel({
          signal: controller.signal,
          onProgress: ({received, total, phase}) => {
            if (
              this.disposed ||
              controller.signal.aborted ||
              this.downloadController !== controller
            )
              return;
            const now = performance.now();
            if (
              phase === lastPhase &&
              now - lastProgressUpdate < TEXT_UPDATE_MS
            )
              return;
            lastProgressUpdate = now;
            lastPhase = phase;
            const bytes = total || MODEL_BYTES;
            this.status.text = `${phase === 'saving' ? 'Saving model' : 'Downloading'}: ${(received / 1e9).toFixed(2)} / ${(bytes / 1e9).toFixed(2)} GB (${Math.round((received / bytes) * 100)}%)`;
          },
        });
        if (this.disposed) return;
        if (this.downloadController.signal.aborted) {
          this.status.text = 'Download canceled. You can retry.';
          return;
        }
        this.cached = true;
      }
      this.downloadController = undefined;
      this.status.text =
        'Initializing Gemma 4 in a WebGPU worker… Initialization cannot be canceled.';
      this.refreshControls();
      await this.client.load();
      if (!this.disposed)
        this.status.text = 'Ready. Inference and prompts stay on this device.';
    } catch (error) {
      if (this.downloadController?.signal.aborted) {
        if (!this.disposed)
          this.status.text = 'Download canceled. You can retry.';
      } else {
        this.showError(error);
      }
    } finally {
      this.downloadController = undefined;
      this.busy = false;
      this.refreshControls();
    }
  }

  async send() {
    if (this.disposed || this.busy || !this.supported) return;
    if (this.client.state !== 'ready') {
      this.status.text =
        'Load Gemma and wait until it is ready before sending.';
      return;
    }
    if (!this.composer.ready || this.composer.error) {
      this.status.text =
        'Text input is not ready. Try again when the input is available.';
      return;
    }
    if (this.client.needsNewChat) {
      this.status.text =
        'Context is nearly full. Choose New chat before sending.';
      return;
    }
    const prompt = this.composer.value;
    if (!prompt.trim() || prompt.length > MAX_PROMPT_LENGTH) {
      this.status.text = prompt.trim()
        ? 'Keep your prompt within 2,000 characters.'
        : 'Enter a prompt before sending.';
      return;
    }
    this.busy = true;
    this.status.text = 'Reading scene metadata…';
    this.refreshControls();
    let acceptingText = true;
    try {
      if (!this.context?.scene)
        throw new Error(
          'Scene context is unavailable. Enable scene context before startup.'
        );
      const {semanticTree} = await this.context.scene.runContextDetection({
        semanticTree: true,
        visibleObjects: false,
        setOfMark: false,
      });
      if (this.disposed) return;
      const sceneContext = compactSceneContext(
        semanticTree,
        this.objects,
        this.selected
      );
      this.contextLabel.text = `Scene metadata, not camera vision: ${sceneContext.objects.length} objects; selected: ${sceneContext.objects.find((object) => object.id === sceneContext.selectedId)?.name ?? 'none'}. Positions and bounds are in meters.`;
      this.appendMessage('You', prompt.trim());
      this.response = this.appendMessage('Gemma', '…');
      this.pendingText = undefined;
      this.lastTextUpdate = -Infinity;
      this.composer.value = '';
      this.metrics.text = 'Time to first text: pending · Decode: pending';
      this.status.text = 'Generating locally…';
      const result = await this.client.send(prompt, sceneContext, {
        onText: (text) => {
          if (!this.disposed && acceptingText) this.pendingText = text;
        },
      });
      if (this.disposed) return;
      this.pendingText = `${result.text}${result.interrupted ? '\n[Interrupted]' : ''}`;
      this.flushText();
      const firstText = Number.isFinite(result.firstTextMs)
        ? `${Math.round(result.firstTextMs)} ms`
        : 'unavailable';
      const rate = Number.isFinite(result.tokensPerSecond)
        ? `${result.tokensPerSecond.toFixed(1)} tokens/s`
        : 'unavailable';
      this.metrics.text = `Time to first text: ${firstText} · Decode: ${rate}`;
      this.status.text = result.interrupted
        ? 'Interrupted. Partial reply kept; the next prompt starts a fresh model conversation.'
        : this.client.needsNewChat
          ? 'Context is nearly full. Choose New chat before sending.'
          : 'Ready. Reply based on scene metadata, not camera vision.';
    } catch (error) {
      if (!this.disposed) this.flushText();
      this.showError(error);
    } finally {
      acceptingText = false;
      this.busy = false;
      this.refreshControls();
    }
  }

  async stop() {
    if (this.disposed) return;
    if (this.downloadController) {
      this.downloadController.abort();
      this.status.text = 'Canceling download…';
      return;
    }
    if (this.client.state !== 'generating') return;
    this.status.text = 'Stopping generation…';
    try {
      await this.client.stop();
    } catch (error) {
      this.showError(error);
    }
  }

  async newChat() {
    if (this.disposed || this.busy || !this.client.loaded) return;
    this.busy = true;
    this.status.text = 'Starting a new chat…';
    this.refreshControls();
    try {
      await this.client.newChat();
      if (this.disposed) return;
      this.history.clear();
      this.pendingBottom = undefined;
      this.pendingText = undefined;
      this.response = undefined;
      this.history.scrollTo(0);
      this.metrics.text =
        'Time to first text: unavailable · Decode: unavailable';
      this.status.text = 'Ready. New chat started; the model remains loaded.';
    } catch (error) {
      this.showError(error);
    } finally {
      this.busy = false;
      this.refreshControls();
    }
  }

  appendMessage(role, message) {
    this.queueBottom();
    const text = new xb.UIText({
      text: message,
      style: {fontSize: 22, whiteSpace: 'pre-line', lineHeight: 1.3},
    });
    this.history.add(
      new xb.UIPanel({
        style: {flexDirection: 'column', gap: 4, flexShrink: 0},
        children: [
          new xb.UIText({
            text: role,
            style: {fontSize: 16, fontWeight: 'bold', color: '#a9c7ec'},
          }),
          text,
        ],
      })
    );
    return text;
  }

  queueBottom() {
    if (
      !this.pendingBottom &&
      this.history.maxScrollTop - this.history.scrollTop < BOTTOM_TOLERANCE
    ) {
      this.pendingBottom = {
        height: this.history.scrollHeight,
        offset: this.history.scrollTop,
      };
    }
  }

  flushText() {
    if (this.pendingText === undefined || !this.response) return;
    this.queueBottom();
    this.response.text = this.pendingText;
    this.pendingText = undefined;
    this.lastTextUpdate = performance.now();
  }

  update() {
    if (this.disposed || !this.composer) return;
    if (performance.now() - this.lastTextUpdate >= TEXT_UPDATE_MS)
      this.flushText();
    if (this.pendingBottom && this.history.ready) {
      if (this.history.scrollTop !== this.pendingBottom.offset) {
        this.pendingBottom = undefined;
      } else if (this.history.scrollHeight !== this.pendingBottom.height) {
        this.history.scrollTo(this.history.maxScrollTop);
        this.pendingBottom = undefined;
      }
    }
    const error = this.composer.error;
    if (error && error !== this.lastInputError) {
      this.showError(new Error(`Text input unavailable: ${error.message}`));
    }
    this.lastInputError = error;
    this.refreshControls();
  }

  showError(error) {
    console.error('Gemma scene:', error);
    if (!this.disposed)
      this.status.text = `Error: ${error.message ?? String(error)}`;
  }

  async dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.downloadController?.abort();
    this.pendingText = undefined;
    this.pendingBottom = undefined;
    for (const object of this.objects) object.dispose();
    this.keyboard?.dispose();
    if (this.composer) {
      this.composer.onSubmit = undefined;
      this.composer.onInput = undefined;
    }
    for (const button of [
      this.loadButton,
      this.sendButton,
      this.stopButton,
      this.newChatButton,
      this.keyboardToggle,
      ...(this.presetButtons ?? []),
    ]) {
      if (button) button.onClick = undefined;
    }
    this.clear();
    try {
      await this.client?.dispose();
    } catch (error) {
      this.showError(error);
    }
  }
}
