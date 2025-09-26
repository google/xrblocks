import 'xrblocks/addons/simulator/instructions/SimulatorInstructions.js';

import * as xb from 'xrblocks';

import {DepthMapScene} from './DepthMapScene.js';

const options = new xb.Options()
options.depth.enabled = true;
options.depth.depthTexture.enabled = true;
options.usePostprocessing = true;

function start() {
  xb.add(new DepthMapScene());
  xb.init(options);
}

document.addEventListener('DOMContentLoaded', function() {
  start();
});
