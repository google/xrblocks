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
  async init() {
    xb.core.renderer.localClippingEnabled = true;

    this.add(new THREE.HemisphereLight(0x888877, 0x777788, 3));
    const light = new THREE.DirectionalLight(0xffffff, 5.0);
    light.position.set(-0.5, 4, 1.0);
    this.add(light);

    await this.loadModels();
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

  async loadModels() {
    const loads = [];
    for (let i = 0; i < this.data.length; i++) {
      if (this.data[i].model) {
        const data = this.data[i];
        const source = data.model;
        const group = new THREE.Group();
        group.position.copy(data.position);
        group.rotation.set(
          data.rotation.x,
          data.rotation.y,
          data.rotation.z,
          'YXZ'
        );
        this.add(group);

        const model = new xb.ModelViewer({
          origin: 'source',
          occlusion: true,
        });
        model.position.copy(source.position ?? {x: 0, y: 0, z: 0});
        group.add(model);
        loads.push(
          model.load({
            url: source.model,
            path: source.path,
            scale: source.scale,
            rotation: source.rotation,
          })
        );
        this.models[i] = model;
      }
    }
    await Promise.all(loads);
  }

  onTriggerRandomQuestion() {
    const geminiLivePanel = document.querySelector(
      'xrblocks-simulator-geminilive'
    );
    if (
      geminiLivePanel &&
      geminiLivePanel.geminiLive &&
      geminiLivePanel.geminiLive.isConnected()
    ) {
      const randomIndex = Math.floor(Math.random() * this.data.length);
      const randomPrompt = this.data[randomIndex].prompt;

      const geminiLive = geminiLivePanel.geminiLive;
      geminiLivePanel.responseText += `\n> Synthesizing speech for: ${randomPrompt}...\n`;
      geminiLive.generateSpeech(randomPrompt).then((resampledData) => {
        geminiLive.sendAudio(resampledData);
      });
    }
  }
}
