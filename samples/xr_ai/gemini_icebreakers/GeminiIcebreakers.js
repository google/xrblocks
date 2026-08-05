import * as THREE from 'three';
import * as xb from 'xrblocks';

import {EarthAnimation} from './EarthAnimation.js';
import {TranscriptionManager} from './TranscriptionManager.js';

const ASSETS_BASE_URL = 'https://cdn.jsdelivr.net/gh/xrblocks/assets@main/';
const PROPRIETARY_ASSETS_BASE_URL =
  'https://cdn.jsdelivr.net/gh/xrblocks/proprietary-assets@main/';

const JOURNEYS = [
  {
    title: 'Mona Lisa',
    source: {
      url: 'mona_lisa_picture_frame_compressed.glb',
      path: PROPRIETARY_ASSETS_BASE_URL + 'monalisa/',
      scale: 4,
    },
    prompt: '“What is she smiling about?”',
  },
  {
    title: 'Chess',
    source: {
      url: 'chess_compressed.glb',
      path: PROPRIETARY_ASSETS_BASE_URL + 'chess/',
      scale: 0.03,
      rotation: {x: THREE.MathUtils.degToRad(80), y: 0, z: 0},
    },
    prompt: '“What is a good strategy for this game?”',
  },
  {
    title: 'Kitchen Challenge',
    source: {
      url: 'vegetable_on_board_compressed.glb',
      path: PROPRIETARY_ASSETS_BASE_URL + 'vegetable_on_board/',
      scale: 0.9,
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
      scale: 0.3,
    },
    prompt: '“If this dinosaur could talk, what would it say?”',
  },
  {
    title: 'Planet Earth',
    source: {
      url: 'Earth_1_12756.glb',
      path: PROPRIETARY_ASSETS_BASE_URL + 'earth/',
      scale: 0.001,
    },
    animation: new EarthAnimation(),
    prompt: '“How big would I need to be to hold this in my hands?”',
  },
];

export class GeminiIcebreakers extends xb.Script {
  constructor() {
    super();
    this.journeyIndex = 0;
    this.isAIRunning = false;
    this.screenshotInterval = null;
    this.activeAnimation = null;
    this.transcriptionManager = null;
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
    this.modelViewer.position.set(0, 1.65, -1.35);
    this.add(this.modelViewer);

    this.titleText = new xb.UIText({
      text: '',
      style: {
        flexGrow: 1,
        fontSize: 30,
        fontWeight: 'bold',
      },
    });
    this.pageText = new xb.UIText({
      text: '',
      style: {fontSize: 20, opacity: 0.65, textAlign: 'right'},
    });
    const heading = new xb.UIPanel({
      style: {
        width: '100%',
        height: 44,
        flexDirection: 'row',
        alignItems: 'center',
      },
      children: [this.titleText, this.pageText],
    });

    this.promptText = new xb.UIText({
      text: '',
      style: {
        width: '100%',
        height: '100%',
        fontSize: 30,
        lineHeight: 1.3,
        textAlign: 'center',
        verticalAlign: 'middle',
        whiteSpace: 'pre-line',
        overflow: 'hidden',
      },
    });
    this.promptPanel = new xb.UIPanel({
      style: {
        width: '100%',
        flexGrow: 1,
        justifyContent: 'center',
        alignItems: 'center',
        overflow: 'hidden',
      },
      children: [this.promptText],
    });

    this.backButton = this.createIconButton(
      'arrow_back',
      'Previous icebreaker',
      () => void this.showJourney(this.journeyIndex - 1)
    );
    this.micButton = this.createIconButton(
      'mic',
      'Start Gemini Live',
      () => void this.toggleGeminiLive()
    );
    this.forwardButton = this.createIconButton(
      'arrow_forward',
      'Next icebreaker',
      () => void this.showJourney(this.journeyIndex + 1)
    );

    this.statusText = new xb.UIText({
      text: 'Loading model…',
      pointerEvents: 'none',
      style: {
        position: 'absolute',
        left: 0,
        right: 0,
        fontSize: 20,
        opacity: 0.65,
        textAlign: 'center',
      },
    });
    const trailingControls = new xb.UIPanel({
      style: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
      },
      children: [this.micButton, this.forwardButton],
    });
    const controls = new xb.UIPanel({
      style: {
        width: '100%',
        height: 56,
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
      },
      children: [this.backButton, this.statusText, trailingControls],
    });

    this.card = new xb.UICard({
      size: {width: 1.05, height: 0.48},
      manipulation: {
        actions: {
          translate: {faceCamera: true},
          scale: {minScale: 0.7, maxScale: 1.7},
        },
        handle: {action: xb.ManipulationAction.Translate},
      },
      edge: {scale: true},
      children: [heading, this.promptPanel, controls],
    });
    this.card.position.set(0, 0.82, -1.25);
    this.add(this.card);
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

  async init() {
    this.ai = xb.core.ai;
    this.sound = xb.core.sound;
    this.screenshotSynthesizer = xb.core.screenshotSynthesizer;

    this.add(new THREE.HemisphereLight(0x888877, 0x777788, 3));
    const light = new THREE.DirectionalLight(0xffffff, 5);
    light.position.set(-0.5, 4, 1);
    this.add(light);

    this.micButton.disabled = !this.ai?.isAvailable();
    if (this.micButton.disabled) this.statusText.text = 'Add a Gemini API key';
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
    this.statusText.text = 'Loading model…';

    try {
      await this.modelViewer.load(journey.source);
      this.journeyIndex = nextIndex;
      this.titleText.text = journey.title;
      this.pageText.text = `${nextIndex + 1} / ${JOURNEYS.length}`;
      this.promptText.text = journey.prompt;
      this.statusText.text = this.ai?.isAvailable()
        ? 'Ask Gemini about this object'
        : 'Add a Gemini API key';
      this.activeAnimation = journey.animation ?? null;
      this.activeAnimation?.setModel(this.modelViewer);
    } catch (error) {
      console.error('Could not load icebreaker model:', error);
      this.statusText.text = 'Could not load this model';
    } finally {
      this.backButton.disabled = false;
      this.forwardButton.disabled = false;
    }
  }

  update() {
    this.activeAnimation?.update(xb.getDeltaTime());
  }

  async toggleGeminiLive() {
    if (this.micButton.disabled) return;
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
    this.statusText.text = 'Connecting…';
    this.promptText.text = 'Listening...';
    this.transcriptionManager = new TranscriptionManager(this.promptText);

    try {
      await this.sound.enableAudio();
      await this.startLiveAI();
      this.isAIRunning = true;
      this.backButton.disabled = true;
      this.forwardButton.disabled = true;
      this.micButton.icon = 'stop';
      this.micButton.ariaLabel = 'Stop Gemini Live';
      this.statusText.text = 'Gemini Live';
      this.startScreenshotCapture();
    } catch (error) {
      console.error('Failed to start AI session:', error);
      this.statusText.text = 'Could not start Gemini Live';
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
    this.micButton.icon = 'mic';
    this.micButton.ariaLabel = 'Start Gemini Live';
    this.statusText.text = 'Ask Gemini about this object';
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
    this.promptPanel.style.justifyContent = active ? 'flex-end' : 'center';
    this.promptText.style.fontSize = active ? 24 : 30;
    this.promptText.style.textAlign = active ? 'left' : 'center';
    this.promptText.style.verticalAlign = active ? 'bottom' : 'middle';
  }

  dispose() {
    this.stopScreenshotCapture();
    this.activeAnimation?.setModel(null);
    if (this.isAIRunning) void this.ai?.stopLiveSession?.();
  }
}
