import * as THREE from 'three';
import * as xb from 'xrblocks';

import {EarthAnimation} from './EarthAnimation.js';
import {TranscriptionManager} from './TranscriptionManager.js';

const ASSETS_BASE_URL = 'https://cdn.jsdelivr.net/gh/xrblocks/assets@main/';
const PROPRIETARY_ASSETS_BASE_URL =
  'https://cdn.jsdelivr.net/gh/xrblocks/proprietary-assets@main/';

const PANEL_WIDTH = 889;
const PANEL_HEIGHT = 625;
const PANEL_PIXEL_SIZE = 0.0026 / 3;
const CONTROLS_HEIGHT = 192;
const PROMPT_GRADIENT = [
  {position: 0, color: '#207cff'},
  {position: 0.25, color: '#098efb'},
  {position: 0.75, color: '#ad87eb'},
  {position: 1, color: '#ee4d5e'},
];

const JOURNEYS = [
  {
    title: 'Mona Lisa',
    source: {
      url: 'mona_lisa_picture_frame_compressed.glb',
      path: PROPRIETARY_ASSETS_BASE_URL + 'monalisa/',
      scale: 1.25,
    },
    prompt: '“What is she smiling about?”',
  },
  {
    title: 'Chess',
    source: {
      url: 'chess_compressed.glb',
      path: PROPRIETARY_ASSETS_BASE_URL + 'chess/',
      scale: 0.009,
      rotation: {x: THREE.MathUtils.degToRad(80), y: 0, z: 0},
    },
    prompt: '“What is a good strategy for this game?”',
  },
  {
    title: 'Kitchen Challenge',
    source: {
      url: 'vegetable_on_board_compressed.glb',
      path: PROPRIETARY_ASSETS_BASE_URL + 'vegetable_on_board/',
      scale: 0.28,
      rotation: {x: THREE.MathUtils.degToRad(75), y: 0, z: 0},
    },
    prompt:
      '“What is the most unexpected dish you could make with these ingredients?”',
  },
  {
    title: 'Dinosaur',
    source: {
      url: 'Parasaurolophus.glb',
      path: ASSETS_BASE_URL + 'models/',
      scale: 0.094,
    },
    prompt: '“If this dinosaur could talk, what would it say?”',
  },
  {
    title: 'Planet Earth',
    source: {
      url: 'Earth_1_12756.glb',
      path: PROPRIETARY_ASSETS_BASE_URL + 'earth/',
      scale: 0.00031,
    },
    animation: new EarthAnimation(),
    prompt: '“How big would I need to be to hold this in my hands?”',
  },
];

class GradientPrompt extends xb.UIImage {
  constructor() {
    const canvas = document.createElement('canvas');
    canvas.width = 1600;
    canvas.height = 260;
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    super({
      src: texture,
      ariaLabel: 'Icebreaker prompt',
      pointerEvents: 'none',
      style: {
        position: 'absolute',
        top: 15,
        left: 95,
        width: 699,
        height: 124,
        objectFit: 'fill',
      },
    });
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.texture = texture;
    this._text = '';
  }

  get text() {
    return this._text;
  }

  set text(value) {
    this._text = value;
    this.draw();
  }

  draw() {
    const {canvas, context, texture} = this;
    if (!context) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.font = '400 72px Roboto, Arial, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';

    const gradient = context.createLinearGradient(180, 0, 1420, 0);
    for (const stop of PROMPT_GRADIENT) {
      gradient.addColorStop(stop.position, stop.color);
    }
    context.fillStyle = gradient;

    const lines = wrapCanvasText(context, this._text, 1420);
    const lineHeight = 82;
    const firstLineY =
      canvas.height / 2 - ((lines.length - 1) * lineHeight) / 2;
    lines.forEach((line, index) => {
      context.fillText(line, canvas.width / 2, firstLineY + index * lineHeight);
    });
    texture.needsUpdate = true;
  }

  disposeTexture() {
    this.texture.dispose();
  }
}

function wrapCanvasText(context, text, maxWidth) {
  const words = text.split(/\s+/u);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && context.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines.length > 0 ? lines : [''];
}

export class GeminiIcebreakers extends xb.Script {
  constructor() {
    super();
    this.journeyIndex = 0;
    this.isAIRunning = false;
    this.screenshotInterval = null;
    this.activeAnimation = null;
    this.transcriptionManager = null;
    this.micBobTime = 0;
    this.buildScene();
  }

  buildScene() {
    this.modelViewer = new xb.ModelViewer({
      origin: 'center',
      manipulation: {
        actions: {
          rotate: {axis: 'y'},
          scale: {minScale: 0.6, maxScale: 1.8},
        },
        handle: {action: xb.ManipulationAction.Rotate},
      },
    });
    this.modelViewer.position.set(0.05, 1.68, -1.0);
    this.add(this.modelViewer);

    this.promptText = new GradientPrompt();
    this.transcriptText = new xb.UIText({
      text: '',
      visible: false,
      pointerEvents: 'none',
      style: {
        position: 'absolute',
        top: 24,
        left: 110,
        width: 669,
        height: 132,
        fontSize: 24,
        lineHeight: 1.2,
        textAlign: 'left',
        verticalAlign: 'bottom',
        whiteSpace: 'pre-line',
        overflow: 'hidden',
      },
    });

    this.backButton = this.createIconButton(
      'arrow_back',
      'Previous icebreaker',
      () => void this.showJourney(this.journeyIndex - 1),
      {left: 36, top: 70, size: 54, iconSize: 36}
    );
    this.micButton = this.createIconButton(
      'mic',
      'Start Gemini Live',
      () => void this.toggleGeminiLive(),
      {right: 98, bottom: CONTROLS_HEIGHT + 47, size: 74, iconSize: 34}
    );
    this.forwardButton = this.createIconButton(
      'arrow_forward',
      'Next icebreaker',
      () => void this.showJourney(this.journeyIndex + 1),
      {right: 36, top: 70, size: 54, iconSize: 36}
    );

    this.pageDots = JOURNEYS.map(
      (_, index) =>
        new xb.UIPanel({
          pointerEvents: 'none',
          style: {
            width: 8,
            height: 8,
            borderRadius: 4,
            backgroundColor: index === 0 ? '#ffffff' : 'transparent',
            borderColor: '#ffffff',
            borderWidth: 1.5,
          },
        })
    );
    const pageIndicator = new xb.UIPanel({
      pointerEvents: 'none',
      style: {
        position: 'absolute',
        bottom: 27,
        left: 0,
        right: 0,
        height: 14,
        flexDirection: 'row',
        justifyContent: 'center',
        alignItems: 'center',
        gap: 6,
      },
      children: this.pageDots,
    });

    const controls = new xb.UIPanel({
      style: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        width: PANEL_WIDTH,
        height: CONTROLS_HEIGHT,
        backgroundColor: 'rgba(0, 0, 0, 0.85)',
        borderRadius: 12,
      },
      children: [
        this.promptText,
        this.transcriptText,
        this.backButton,
        this.forwardButton,
        pageIndicator,
      ],
    });
    this.closeButton = this.createIconButton(
      'close',
      'Close icebreakers',
      () => {
        this.card.visible = false;
      },
      {
        left: -9,
        bottom: CONTROLS_HEIGHT + 6,
        size: 52,
        iconSize: 32,
      }
    );
    controls.add(this.closeButton, this.micButton);
    this.card = new xb.UICard({
      size: {
        width: PANEL_WIDTH * PANEL_PIXEL_SIZE,
        height: PANEL_HEIGHT * PANEL_PIXEL_SIZE,
      },
      pixelSize: PANEL_PIXEL_SIZE,
      appearance: 'none',
      style: {backgroundColor: 'transparent'},
      children: [controls],
    });
    this.card.position.set(0.05, 1.54, -1.0);
    this.add(this.card);
  }

  createIconButton(icon, ariaLabel, onClick, layout) {
    return new xb.UIButton({
      ariaLabel,
      onClick,
      children: [
        new xb.UIIcon({
          icon,
          filled: icon === 'mic',
          pointerEvents: 'none',
          style: {
            width: layout.iconSize,
            height: layout.iconSize,
            color: '#ffffff',
          },
        }),
      ],
      style: {
        position: 'absolute',
        width: layout.size,
        height: layout.size,
        ...(layout.top === undefined ? {} : {top: layout.top}),
        ...(layout.right === undefined ? {} : {right: layout.right}),
        ...(layout.bottom === undefined ? {} : {bottom: layout.bottom}),
        ...(layout.left === undefined ? {} : {left: layout.left}),
        ...(icon === 'mic' ? {transform: {translateY: 0}} : {}),
        justifyContent: 'center',
        alignItems: 'center',
        padding: 0,
        paddingTop: 0,
        paddingRight: 0,
        paddingBottom: 0,
        paddingLeft: 0,
        backgroundColor: 'transparent',
        borderColor: 'transparent',
        borderWidth: 0,
        borderRadius: layout.size / 2,
        ':hover': {backgroundColor: 'rgba(255, 255, 255, 0.12)'},
        ':active': {backgroundColor: 'rgba(255, 255, 255, 0.22)'},
        ':disabled': {backgroundColor: 'transparent', color: '#ffffff'},
      },
    });
  }

  async init() {
    this.ai = xb.core.ai;
    this.sound = xb.core.sound;
    this.screenshotSynthesizer = xb.core.screenshotSynthesizer;

    this.add(new THREE.HemisphereLight(0x888877, 0x777788, 3));
    const light = new THREE.DirectionalLight(0xffffff, 5);
    light.position.set(-0.5, 4, 1);
    this.add(light);

    this.micButton.visible = Boolean(this.ai?.isAvailable());
    await this.showJourney(0);
  }

  async showJourney(index) {
    if (this.isAIRunning || this.backButton.disabled) return;

    const nextIndex = (index + JOURNEYS.length) % JOURNEYS.length;
    const journey = JOURNEYS[nextIndex];
    this.backButton.disabled = true;
    this.forwardButton.disabled = true;
    this.activeAnimation?.setModel(null);
    this.activeAnimation = null;
    this.modelViewer.rotation.set(0, 0, 0);

    try {
      await this.modelViewer.load(journey.source);
      this.journeyIndex = nextIndex;
      this.promptText.text = journey.prompt;
      this.updatePageIndicator();
      this.activeAnimation = journey.animation ?? null;
      this.activeAnimation?.setModel(this.modelViewer);
    } catch (error) {
      console.error('Could not load icebreaker model:', error);
      this.promptText.text = 'Could not load this model';
    } finally {
      this.backButton.disabled = false;
      this.forwardButton.disabled = false;
    }
  }

  update() {
    const deltaTime = xb.getDeltaTime();
    this.activeAnimation?.update(deltaTime);

    if (this.isAIRunning) {
      this.micBobTime += deltaTime;
      this.micButton.style.transform.translateY =
        Math.sin(this.micBobTime * 2) * 6;
    } else if (this.micButton.style.transform.translateY !== 0) {
      this.micBobTime = 0;
      this.micButton.style.transform.translateY = 0;
    }
  }

  async toggleGeminiLive() {
    if (!this.ai?.isAvailable() || this.micButton.disabled) return;
    this.micButton.disabled = true;
    try {
      if (this.isAIRunning) await this.stopGeminiLive();
      else await this.startGeminiLive();
    } finally {
      this.micButton.disabled = !this.ai?.isAvailable();
    }
  }

  async startGeminiLive() {
    if (this.isAIRunning) return;
    this.setTranscriptMode(true);
    this.transcriptText.text = 'Listening...';
    this.transcriptionManager = new TranscriptionManager(this.transcriptText);

    try {
      await this.sound.enableAudio();
      await this.startLiveAI();
      this.isAIRunning = true;
      this.backButton.disabled = true;
      this.forwardButton.disabled = true;
      this.micButton.ariaLabel = 'Stop Gemini Live';
      this.startScreenshotCapture();
    } catch (error) {
      console.error('Failed to start AI session:', error);
      this.restorePrompt();
      await this.ai?.stopLiveSession?.();
    }
  }

  async stopGeminiLive() {
    if (!this.isAIRunning) return;
    this.isAIRunning = false;
    this.stopScreenshotCapture();
    await this.ai?.stopLiveSession?.();
    this.sound.stopAIAudio?.();
    this.transcriptionManager?.clear();
    this.transcriptionManager = null;
    this.backButton.disabled = false;
    this.forwardButton.disabled = false;
    this.micButton.ariaLabel = 'Start Gemini Live';
    this.restorePrompt();
  }

  async startLiveAI() {
    return new Promise((resolve, reject) => {
      void this.ai.setLiveCallbacks({
        onopen: resolve,
        onmessage: (message) => this.handleAIMessage(message),
        onerror: reject,
        onclose: () => {
          if (this.isAIRunning) void this.stopGeminiLive();
        },
      });
      this.ai.startLiveSession().catch(reject);
    });
  }

  handleAIMessage(message) {
    if (message.data) void this.sound.playAIAudio(message.data);

    const content = message.serverContent;
    if (!content) return;
    if (content.inputTranscription?.text) {
      this.transcriptionManager?.handleInputTranscription(
        content.inputTranscription.text
      );
    }
    if (content.outputTranscription?.text) {
      this.transcriptionManager?.handleOutputTranscription(
        content.outputTranscription.text
      );
    }
    if (content.turnComplete) this.transcriptionManager?.finalizeTurn();
  }

  startScreenshotCapture() {
    this.stopScreenshotCapture();
    this.screenshotInterval = window.setInterval(async () => {
      try {
        const image = await this.screenshotSynthesizer.getScreenshot();
        if (!image) return;
        const data = image.startsWith('data:') ? image.split(',')[1] : image;
        this.ai.sendRealtimeInput({
          video: {data, mimeType: 'image/png'},
        });
      } catch (error) {
        console.warn('Could not send the XR view to Gemini:', error);
        await this.stopGeminiLive();
      }
    }, 1000);
  }

  stopScreenshotCapture() {
    window.clearInterval(this.screenshotInterval);
    this.screenshotInterval = null;
  }

  restorePrompt() {
    this.setTranscriptMode(false);
    this.promptText.text = JOURNEYS[this.journeyIndex].prompt;
  }

  setTranscriptMode(active) {
    this.promptText.visible = !active;
    this.transcriptText.visible = active;
  }

  updatePageIndicator() {
    for (let index = 0; index < this.pageDots.length; index++) {
      this.pageDots[index].style.backgroundColor =
        index === this.journeyIndex ? '#ffffff' : 'transparent';
    }
  }

  dispose() {
    this.stopScreenshotCapture();
    this.activeAnimation?.setModel(null);
    this.promptText.disposeTexture();
    if (this.isAIRunning) void this.ai?.stopLiveSession?.();
  }
}
