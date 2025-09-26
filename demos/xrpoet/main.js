import 'xrblocks/addons/simulator/SimulatorAddons.js';

import * as xb from 'xrblocks';

import {PoemGenerator} from './PoemGenerator.js';

const options = new xb.Options();
options.enableUI();
options.enableAI();
options.enableCamera();

function start() {
  try {
    xb.init(options);
    xb.add(new PoemGenerator());
  } catch (error) {
    console.error('Failed to initialize XR app:', error);
  }
}

document.addEventListener('DOMContentLoaded', function() {
  start();
});
