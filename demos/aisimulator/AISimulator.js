import * as THREE from 'three';
import * as xb from 'xrblocks';

import {DATA} from './model_data.js';

export class AISimulator extends xb.Script {
  constructor() {
    super();

    // Loads data.
    this.data = DATA;
    this.models = [];
  }

  /**
   * Initializes the script.
   */
  init(...args) {
    super.init(...args);
    xb.core.renderer.localClippingEnabled = true;

    this.add(new THREE.HemisphereLight(0x888877, 0x777788, 3));
    const light = new THREE.DirectionalLight(0xffffff, 5.0);
    light.position.set(-0.5, 4, 1.0);
    this.add(light);

    console.log('Gemini Quest UIs: ', xb.core.ui.views);
    this.loadModels();
    document.addEventListener('keydown', (event) => {
      if (event.code === 'KeyI') {
        this.onTriggerRandomQuestion();
      }
    });
  }

  onSimulatorStarted() {
    const backgroundImageElement = document.getElementById('background-image');
    if (backgroundImageElement) {
      backgroundImageElement.style.zIndex = -1;
    }
  }

  queryGemini() {
    const response = xb.core.ai.query('what is it?', this.image.toBase64());
  }

  changeMeshColor() {}

  /**
   * Moves the painter to the pivot position when select starts.
   * @param {XRInputSourceEvent} event
   */
  onSelectStart(event) {}

  /**
   * Updates the painter's line to the current pivot position during selection.
   * @param {number} id The controller id.
   */
  onSelecting(id) {}

  update() {
    const deltaTime = xb.getDeltaTime();
    for (const model of this.data) {
      model.modelAnimation?.update(deltaTime);
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
            console.log('scene loaded');
            model.position.copy(data.position);
            model.rotation.set(
                data.rotation.x, data.rotation.y, data.rotation.z, 'YXZ');
            this.add(model);
          },
          addOcclusionToShader: true
        });
        this.models[i] = model;
      }
    }
  }

  onTriggerRandomQuestion() {
    const geminiLivePanel =
        document.querySelector('xrblocks-simulator-geminilive');
    if (geminiLivePanel && geminiLivePanel.geminiLive &&
        geminiLivePanel.geminiLive.isConnected()) {
      const randomIndex = Math.floor(Math.random() * this.data.length);
      const randomPrompt = this.data[randomIndex].prompt;

      const geminiLive = geminiLivePanel.geminiLive;
      geminiLivePanel.responseText +=
          `\n> Synthesizing speech for: ${randomPrompt}...\n`;
      geminiLive.generateSpeech(randomPrompt).then((resampledData) => {
        geminiLive.sendAudio(resampledData);
      });
    }
  }
};
