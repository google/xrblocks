import * as THREE from 'three';
import * as xb from 'xrblocks';

import {EarthAnimation} from './EarthAnimation.js';
import {TranscriptionManager} from './TranscriptionManager.js';

const ASSETS_BASE_URL = 'https://cdn.jsdelivr.net/gh/xrblocks/assets@main/';
const PROPRIETARY_ASSETS_BASE_URL =
  'https://cdn.jsdelivr.net/gh/xrblocks/proprietary-assets@main/';

const DATA = [
  {
    model: {
      scale: {x: 4.0, y: 4.0, z: 4.0},
      path: PROPRIETARY_ASSETS_BASE_URL + 'monalisa/',
      model: 'mona_lisa_picture_frame_compressed.glb',
      verticallyAlignObject: false,
    },
    prompt: '“What is she smiling about?”',
  },
  {
    model: {
      scale: {x: 0.03, y: 0.03, z: 0.03},
      rotation: {x: 80, y: 0, z: 0},
      position: {x: 0, y: -0.2, z: -3.0},
      path: PROPRIETARY_ASSETS_BASE_URL + 'chess/',
      model: 'chess_compressed.glb',
      verticallyAlignObject: false,
    },
    prompt: "“What's a good strategy for this game?”",
  },
  {
    model: {
      scale: {x: 0.9, y: 0.9, z: 0.9},
      rotation: {x: 75, y: 0, z: 0},
      position: {x: 0, y: 0.0, z: 0},
      path: PROPRIETARY_ASSETS_BASE_URL + 'vegetable_on_board/',
      model: 'vegetable_on_board_compressed.glb',
      verticallyAlignObject: false,
    },
    prompt:
      '“What is the most unexpected dish you could make with these ingredients?”',
  },
  {
    model: {
      path: ASSETS_BASE_URL + 'models/',
      model: 'Parasaurolophus.glb',
      scale: {x: 0.3, y: 0.3, z: 0.3},
      position: {x: 0, y: -0.6, z: 0},
      verticallyAlignObject: false,
      horizontallyAlignObject: false,
    },
    prompt: '“If this dinosaur could talk, what would it say?”',
  },
  {
    model: {
      path: PROPRIETARY_ASSETS_BASE_URL + 'earth/',
      model: 'Earth_1_12756.glb',
      scale: {x: 0.001, y: 0.001, z: 0.001},
      position: {x: 0, y: 0, z: 0},
      verticallyAlignObject: false,
    },
    modelAnimation: new EarthAnimation(),
    prompt: '“How big would I need to be to hold this in my hands?”',
  },
];

export class GeminiIcebreakers extends xb.Script {
  constructor() {
    super();

    // Loads data.
    this.data = DATA;
    this.journeyId = 0;
    this.models = [];
    this.isAIRunning = false;
    this.screenshotInterval = null;
    this.time = 0;
    this.micButtonInitialY = null;
    this.transcriptionManager = null;

    // Initializes UI.
    const panel = new xb.SpatialPanel({
      backgroundColor: '#00000000',
      useDefaultPosition: false,
      showEdge: false,
    });
    this.add(panel);

    this.descriptionPagerState = new xb.PagerState({pages: DATA.length});
    console.log('pages:', this.descriptionPagerState.pages);
    const grid = panel.addGrid();

    const imageRow = grid.addRow({weight: 0.5});
    imageRow.addCol({weight: 0.1});
    this.imagePager = new xb.HorizontalPager({
      state: this.descriptionPagerState,
    });
    imageRow.addCol({weight: 0.8}).add(this.imagePager);
    imageRow.addCol({weight: 0.1});
    for (let i = 0; i < DATA.length; i++) {
      if (DATA[i].src) {
        this.imagePager.children[i].addImage({src: DATA[i].src});
      } else {
        this.imagePager.children[i].add(new xb.View());
      }
    }

    grid.addRow({weight: 0.15});
    const controlRow = grid.addRow({weight: 0.35});

    const ctrlPanel = controlRow.addPanel({backgroundColor: '#000000D9'});

    const ctrlGrid = ctrlPanel.addGrid();
    {
      const leftColumn = ctrlGrid.addCol({weight: 0.1});
      this.backButton = leftColumn.addIconButton({
        text: 'arrow_back',
        fontSize: 0.5,
        paddingX: 0.2,
      });

      const midColumn = ctrlGrid.addCol({weight: 0.8});
      const descRow = midColumn.addRow({weight: 0.8});
      this.descRow = descRow;

      // TODO: use phong and point light to highlight gemini.
      this.add(this.descriptionPagerState);
      this.descriptionPager = new xb.HorizontalPager({
        state: this.descriptionPagerState,
        enableRaycastOnChildren: false,
      });
      descRow.add(this.descriptionPager);
      this.transcriptView = new xb.ScrollingTroikaTextView({
        text: '',
        fontSize: 0.05,
        textAlign: 'left',
      });
      for (let i = 0; i < DATA.length; i++) {
        this.descriptionPager.children[i].add(
          new xb.TextView({
            text: this.data[i].prompt,
            fontColor: '#ffffff',
            imageOverlay: 'images/gradient.png',
            /** This modifier makes the gradient more towards purple. */
            imageOffsetX: 0.2,
          })
        );
      }

      const botRow = midColumn.addRow({weight: 0.1});

      botRow.add(
        new xb.PageIndicator({
          pagerState: this.descriptionPager.state,
          fontColor: '#FFFFFF',
        })
      );

      const rightColumn = ctrlGrid.addCol({weight: 0.1});

      this.forwardButton = rightColumn.addIconButton({
        text: 'arrow_forward',
        fontSize: 0.5,
        paddingX: -0.2,
      });

      this.micButton = ctrlGrid.addCol({weight: 0.1}).addIconButton({
        text: 'mic',
        fontSize: 0.8,
        paddingX: -2,
        paddingY: -1,
        fontColor: '#fdfdfdff',
      });
      this.micButton.onTriggered = () => {
        this.toggleGeminiLive();
      };
    }

    const orbiter = ctrlGrid.addOrbiter();
    orbiter.addExitButton();

    panel.updateLayouts();

    this.panel = panel;

    // TODO(M): This is a bad design, onSelect is triggered twice
    // when user pinches.
    this.backButton.onTriggered = (id) => {
      console.log('back button');
      this.loadPrevious();
    };

    this.forwardButton.onTriggered = (id) => {
      console.log('forward button');
      this.loadNext();
    };
  }

  /**
   * Initializes the script.
   */
  init() {
    this.loadModels();
    xb.core.renderer.localClippingEnabled = true;

    this.add(new THREE.HemisphereLight(0x888877, 0x777788, 3));
    const light = new THREE.DirectionalLight(0xffffff, 5.0);
    light.position.set(-0.5, 4, 1.0);
    this.add(light);

    this.panel.position.set(0, 1.2, -1.0);

    if (!xb.core.ai || !xb.core.ai.options.gemini.apiKey) {
      this.micButton.visible = false;
    }
  }

  reload() {
    const roundedCurrentPage = Math.round(
      this.descriptionPagerState.currentPage
    );
    if (roundedCurrentPage != this.journeyId) {
      this.descriptionPagerState.currentPage = this.journeyId;
    }
  }

  loadPrevious() {
    this.journeyId = (this.journeyId - 1 + this.data.length) % this.data.length;
    this.reload();
  }

  loadNext() {
    this.journeyId = (this.journeyId + 1 + this.data.length) % this.data.length;
    this.reload();
  }

  update() {
    const deltaTime = xb.getDeltaTime();
    this.time += deltaTime;

    if (this.micButtonInitialY === null && this.micButton.visible) {
      this.micButtonInitialY = this.micButton.position.y;
    }

    const roundedCurrentPage = Math.round(
      this.descriptionPagerState.currentPage
    );
    if (this.journeyId != roundedCurrentPage) {
      this.journeyId = roundedCurrentPage;
      this.reload();
    }

    for (const model of this.data) {
      model.modelAnimation?.update(deltaTime);
    }

    if (
      this.micButtonInitialY !== null &&
      this.micButton.visible &&
      this.isAIRunning
    ) {
      const jumpHeight = 0.05;
      const jumpSpeed = 4;
      this.micButton.position.y =
        this.micButtonInitialY +
        Math.abs(Math.sin(this.time * jumpSpeed)) * jumpHeight;
    } else if (this.micButtonInitialY !== null) {
      this.micButton.position.y = this.micButtonInitialY;
    }
  }

  loadModels() {
    for (let i = 0; i < this.data.length; i++) {
      if (this.data[i].model) {
        const data = this.data[i];
        const model = new xb.ModelViewer({});
        model.loadGLTFModel({
          data: this.data[i].model,
          setupPlatform: false,
          setupRaycastCylinder: false,
          setupRaycastBox: true,
          renderer: xb.core.renderer,
          onSceneLoaded: () => {
            this.reload();
            this.imagePager.children[i].children[0].add(model);
            data.modelAnimation?.setModel(model);
          },
        });
        this.models[i] = model;
      }
    }
  }

  async toggleGeminiLive() {
    return this.isAIRunning ? this.stopGeminiLive() : this.startGeminiLive();
  }

  async startGeminiLive() {
    if (this.isAIRunning) return;
    try {
      this.descriptionPager.visible = false;
      this.descRow.add(this.transcriptView);
      this.transcriptView.visible = true;
      this.transcriptionManager = new TranscriptionManager(this.transcriptView);
      await xb.core.sound.enableAudio();
      await this.startLiveAI();
      this.startScreenshotCapture();
      this.isAIRunning = true;
    } catch (error) {
      console.error('Failed to start AI session:', error);
      this.cleanup();
      this.isAIRunning = false;
    }
  }

  async stopGeminiLive() {
    if (this.transcriptionManager) {
      this.transcriptionManager.clear();
    }
    if (!this.isAIRunning) return;
    this.descriptionPager.state.currentPage = this.journeyId;
    this.descriptionPager.visible = true;
    this.transcriptView.visible = false;
    await xb.core.ai?.stopLiveSession?.();
    this.cleanup();
    if (this.screenshotInterval) {
      clearInterval(this.screenshotInterval);
      this.screenshotInterval = null;
    }
  }

  async startLiveAI() {
    return new Promise((resolve, reject) => {
      xb.core.ai.setLiveCallbacks({
        onopen: resolve,
        onmessage: (message) => this.handleAIMessage(message),
        onerror: reject,
        onclose: (closeEvent) => {
          this.cleanup();
          this.isAIRunning = false;
        },
      });
      xb.core.ai.startLiveSession().catch(reject);
    });
  }

  handleAIMessage(message) {
    message.data && xb.core.sound.playAIAudio(message.data);

    const content = message.serverContent;
    if (content) {
      content.inputTranscription?.text &&
        this.transcriptionManager.handleInputTranscription(
          content.inputTranscription.text
        );
      content.outputTranscription?.text &&
        this.transcriptionManager.handleOutputTranscription(
          content.outputTranscription.text
        );
      content.turnComplete && this.transcriptionManager.finalizeTurn();
    }
  }

  cleanup() {
    this.isAIRunning = false;
  }

  startScreenshotCapture() {
    this.screenshotInterval = setInterval(async () => {
      const base64Image = await xb.core.screenshotSynthesizer.getScreenshot();
      if (base64Image) {
        const base64Data = base64Image.startsWith('data:')
          ? base64Image.split(',')[1]
          : base64Image;
        try {
          xb.core.ai?.sendRealtimeInput?.({
            video: {data: base64Data, mimeType: 'image/png'},
          });
        } catch (error) {
          console.warn(error);
          this.stopGeminiLive();
        }
      }
    }, 1000);
  }
}
