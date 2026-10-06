import * as xb from 'xrblocks';

import {CaptionsDemo} from './CaptionsDemo.js';
import {decodeWav} from './audio.js';
import {bindPreload} from './preload.js';

const scene = new CaptionsDemo();
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
    if (window.offlineCaptions?.scene === scene) delete window.offlineCaptions;
  }
}

const options = new xb.Options();
options.xrButton.showEnterSimulatorButton = true;
options.xrButton.appTitle = 'Offline captions';
options.xrButton.appDescription =
  'Live captions from your microphone, recognized on this device.';

xb.add(scene, new PreloadPanel());
try {
  await xb.init(options);
  xb.core.xrButton?.domElement?.prepend(panel);
  if (new URLSearchParams(window.location.search).get('debug') === '1') {
    // Test hook: caption a local WAV through the same pipeline as the mic.
    window.offlineCaptions = {
      scene,
      async feedUrl(url, options) {
        const response = await fetch(url);
        if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
        const {samples, sampleRate} = decodeWav(await response.arrayBuffer());
        return scene.feed(samples, sampleRate, options);
      },
    };
  }
} catch (error) {
  console.error('Offline captions initialization failed', error);
  document.body.append(panel);
  panel.querySelector('#startup').textContent =
    `Could not start the scene: ${error.message}. Reload to try again.`;
  panel.querySelector('#preload-ready').hidden = true;
  for (const button of panel.querySelectorAll('button')) button.disabled = true;
  panel.hidden = false;
}
