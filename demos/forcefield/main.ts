import 'xrblocks/addons/simulator/SimulatorAddons.js';

import * as xb from 'xrblocks';
import {ForceFieldScene} from './ForceFieldScene.js';

const options = new xb.Options();
options.depth = new xb.DepthOptions();
options.depth.matchDepthView = false;
options.reticles.enabled = true;
options.controllers.performRaycastOnUpdate = true;
options.xrButton = {
  ...options.xrButton,
  startText: '<i id="xrlogo"></i> ENTER THE FIELD',
  endText: '<i id="xrlogo"></i> EXIT THE FIELD',
};

async function start() {
  xb.add(new ForceFieldScene());
  await xb.init(options);
}

document.addEventListener('DOMContentLoaded', () => start());
