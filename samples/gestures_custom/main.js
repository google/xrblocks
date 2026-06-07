import 'xrblocks/addons/simulator/SimulatorAddons.js';

import * as xb from 'xrblocks';

import {
  CustomGestureDemo,
  CustomGestureRecognizer,
} from './CustomGestureDemo.js';

const options = new xb.Options({
  antialias: true,
  reticles: {enabled: true},
  visualizeRays: false,
  hands: {enabled: true, visualization: false},
  simulator: {defaultMode: xb.SimulatorMode.POSE},
});
options.enableGestures();
options.gestures.setGestureRecognizer(new CustomGestureRecognizer());

async function start() {
  options.setAppTitle('Custom Gestures');
  xb.add(new CustomGestureDemo());
  await xb.init(options);
}

document.addEventListener('DOMContentLoaded', function () {
  setTimeout(function () {
    start();
  }, 200);
});
