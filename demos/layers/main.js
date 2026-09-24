import * as xb from 'xrblocks';

import {LayersScene} from './LayersScene.js';

const options = new xb.Options();
options.enableLayers();
options.reticles.enabled = true;
// Lets the demo be opened on a desktop, where it falls back to drawing both
// copies into the scene and says so.
options.xrButton.showEnterSimulatorButton = true;
options.setAppTitle('WebXR Layers');
options.setAppDescription(
  'Compares a quad composition layer against the same content rendered into ' +
    'the eye buffer. The two swap every few seconds; select to swap manually.'
);

async function start() {
  await xb.init(options);
  xb.add(new LayersScene());
}

document.addEventListener('DOMContentLoaded', start);
