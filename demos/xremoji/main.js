import 'xrblocks/addons/simulator/SimulatorAddons.js';

import * as xb from 'xrblocks';

import {MeetEmoji} from './MeetEmoji.js'

const options = new xb.Options({
  antialias: true,
  reticles: {enabled: true},
  visualizeRays: false,
  hands: {enabled: true, visualization: true},
  simulator: {defaultMode: xb.SimulatorMode.POSE}
});

async function start() {
  xb.add(new MeetEmoji());
  await xb.init(options);
}

document.addEventListener('DOMContentLoaded', function() {
  setTimeout(function() {
    start();
  }, 200);
});
