import 'xrblocks/addons/simulator/SimulatorAddons.js';

import * as xb from 'xrblocks';

import {ScreenWiperScene} from './ScreenWiperScene.js'

const options = new xb.Options()
options.antialias = true;
options.reticles.enabled = true;
options.visualizeRays = true;

function start() {
  xb.add(new ScreenWiperScene());
  xb.init(options);
}

document.addEventListener('DOMContentLoaded', function() {
  start();
});
