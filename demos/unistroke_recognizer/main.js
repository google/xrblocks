import 'xrblocks/addons/simulator/SimulatorAddons.js';
import * as xb from 'xrblocks';

import {UnistrokeTracker} from './UnistrokeTracker.js';

const options = new xb.Options();
options.world.enabled = true;
options.hands.enabled = true;
options.enableStrokes();
options.simulator.modeToggle.enabled = true;
options.xrButton.showEnterSimulatorButton = true;

options.setAppTitle('Unistroke Recognizer');
options.setAppDescription(
  'Tracks hand pinch, recognizes shapes accurately, and shoots them out.'
);

function start() {
  const tracker = new UnistrokeTracker();
  xb.add(tracker);
  xb.init(options);
}

document.addEventListener('DOMContentLoaded', function () {
  start();
});
