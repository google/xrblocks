import * as xb from 'xrblocks';

import {GestureInspector} from './GestureInspector.js';

const options = new xb.Options();
options.enableGestures();
options.enableReticles();
options.gestures.setGestureEnabled('point', true);
options.gestures.setGestureEnabled('spread', true);
options.hands.visualization = true;
options.hands.visualizeJoints = true;
options.hands.visualizeMeshes = true;
options.simulator.defaultMode = xb.SimulatorMode.POSE;
options.xrButton.showEnterSimulatorButton = true;

document.addEventListener('DOMContentLoaded', async () => {
  xb.add(new GestureInspector());
  await xb.init(options);
});
