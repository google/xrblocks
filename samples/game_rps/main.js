import 'xrblocks/addons/simulator/SimulatorAddons.js';

import * as xb from 'xrblocks';

import {GameRps} from './GameRps.js'

const options = new xb.Options();
options.reticles.enabled = true;
options.controllers.visualizeRays = false;
options.simulator.defaultMode = xb.SimulatorMode.POSE;
options.simulator.defaultHand = xb.Handedness.RIGHT;

options.hands.enabled = true;
options.hands.visualization = false;

async function start() {
  xb.add(new GameRps());
  await xb.init(options);
}

document.addEventListener('DOMContentLoaded', function() {
  setTimeout(function() {
    start();
  }, 200);
});
