import * as xb from 'xrblocks';
import {GemmaScene} from './GemmaScene.js';
import {bindPreload} from './preload.js';

const scene = new GemmaScene();
const panel = document.getElementById('model-preload');

class PreloadPanel extends xb.Script {
  init() {
    this.controls = bindPreload(scene, panel);
    this.lastRefresh = 0;
  }

  update() {
    const now = performance.now();
    if (panel.hidden || now - this.lastRefresh < 100) return;
    this.lastRefresh = now;
    this.controls.refresh();
  }

  onXRSessionStarted() {
    panel.hidden = true;
  }

  onXRSessionEnded() {
    panel.hidden = false;
  }

  onSimulatorStarted() {
    panel.hidden = true;
  }

  dispose() {
    this.controls?.dispose();
    panel.remove();
  }
}

const options = new xb.Options().enableSceneContext().enableHands();
options.xrButton.showEnterSimulatorButton = true;
options.xrButton.appTitle = 'Gemma 4 on-device';
options.xrButton.appDescription =
  'Ask anything, or select an object and use a scene preset. No API key or cloud inference.';

xb.add(scene, new PreloadPanel());
try {
  await xb.init(options);
  xb.core.xrButton?.domElement.prepend(panel);
} catch (error) {
  console.error('Gemma scene initialization failed', error);
  document.getElementById('startup').textContent =
    `Could not start the scene: ${error.message}`;
}
