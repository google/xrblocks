import * as xb from 'xrblocks';

import {GemmaVisionDemo} from './GemmaVisionDemo.js';
import {bindPreload} from './preload.js';

const scene = new GemmaVisionDemo();
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
    panel.querySelector('#preload-continue').hidden = !xb.core.simulatorRunning;
    this.controls.refresh();
  }

  onSimulatorStarted() {
    // Core disposes XRButton after this callback, so rescue its child first.
    document.body.append(panel);
    panel.querySelector('#preload-continue').hidden = false;
    panel.hidden = false;
    this.controls.refresh();
  }

  dispose() {
    this.controls?.dispose();
    panel.remove();
    if (window.gemmaVision === scene) delete window.gemmaVision;
  }
}

const options = new xb.Options().enableCamera();
options.xrButton.showEnterSimulatorButton = true;
options.xrButton.appTitle = 'What am I looking at?';
options.xrButton.appDescription =
  'Capture an image and ask Gemma 4 about it. On-device inference, no API key.';

xb.add(scene, new PreloadPanel());
try {
  await xb.init(options);
  xb.core.xrButton?.domElement?.prepend(panel);
  if (new URLSearchParams(window.location.search).get('debug') === '1') {
    window.gemmaVision = scene;
  }
} catch (error) {
  console.error('Gemma vision initialization failed', error);
  document.body.append(panel);
  panel.querySelector('#startup').textContent =
    `Could not start the scene: ${error.message}. Reload to try again.`;
  panel.querySelector('#preload-ready').hidden = true;
  for (const control of panel.querySelectorAll('button, select')) {
    control.disabled = true;
  }
  panel.hidden = false;
}
