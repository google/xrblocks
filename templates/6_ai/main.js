import 'xrblocks/addons/simulator/SimulatorAddons.js';

import * as xb from 'xrblocks';

import {GeminiQueryManager} from './GeminiQueryManager.js';

const options = new xb.Options();
options.enableUI();
options.enableAI();

function start() {
  try {
    xb.init(options);
    xb.add(new GeminiQueryManager());
  } catch (error) {
    console.error('Failed to initialize XR app:', error);
  }
}

document.addEventListener('DOMContentLoaded', function() {
  start();
});
