import * as xb from 'xrblocks';

import {ScreenWiperScene} from './ScreenWiperScene.js';

const options = new xb.Options();
options.antialias = true;
options.reticles.enabled = true;
options.controllers.visualizeRays = true;
options.setAppTitle('Screen Wiper');
options.setAppDescription('Use both controllers to wipe the screen clear.');

function start() {
  xb.add(new ScreenWiperScene());
  xb.init(options);
}

document.addEventListener('DOMContentLoaded', function () {
  start();
});
