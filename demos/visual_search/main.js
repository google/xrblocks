import * as xb from 'xrblocks';

import {VisualSearchDemo} from './VisualSearchDemo.js';
import {bindPreload} from './preload.js';

const scene = new VisualSearchDemo();
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
    if (window.visualSearch?.scene === scene) delete window.visualSearch;
  }
}

const options = new xb.Options();
options.enableCamera();
// Depth lets the marker land on the surface; without it the marker sits on
// the camera ray at a fixed distance.
options.enableDepth();
options.xrButton.showEnterSimulatorButton = true;
options.xrButton.appTitle = 'Visual search';
options.xrButton.appDescription =
  'Find things in the camera view by describing them, on this device.';

xb.add(scene, new PreloadPanel());
try {
  await xb.init(options);
  xb.core.xrButton?.domElement?.prepend(panel);
  if (new URLSearchParams(window.location.search).get('debug') === '1') {
    // Test hook: run a search without typing on the card.
    window.visualSearch = {scene, search: (query) => scene.search(query)};
  }
} catch (error) {
  console.error('Visual search initialization failed', error);
  document.body.append(panel);
  panel.querySelector('#startup').textContent =
    `Could not start the scene: ${error.message}. Reload to try again.`;
  panel.querySelector('#preload-ready').hidden = true;
  for (const button of panel.querySelectorAll('button')) button.disabled = true;
  panel.hidden = false;
}
