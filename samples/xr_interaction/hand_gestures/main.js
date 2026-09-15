import * as xb from 'xrblocks';

import {CustomGestureRecognizer, HandGestureDemo} from './HandGestureDemo.js';

const options = new xb.Options();
const gestureRecognizer = new CustomGestureRecognizer();
options.enableGestures();
options.enableReticles();
options.gestures.setGestureRecognizer(gestureRecognizer);
options.simulator.defaultMode = xb.SimulatorMode.POSE;

async function start() {
  options.setAppTitle('Hand Gestures');
  options.setAppDescription(
    'Recognize custom static hand gestures with a LiteRT model.'
  );
  xb.add(new HandGestureDemo(gestureRecognizer));
  await xb.init(options);
}

document.addEventListener('DOMContentLoaded', start);
