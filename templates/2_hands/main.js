// Provides optional 2D UIs for simulator on desktop.
import 'xrblocks/addons/simulator/SimulatorAddons.js';

import * as xb from 'xrblocks';

import {HandsInteraction} from './HandsInteraction.js'

const options = new xb.Options();
options.enableReticles();
options.enableHands();

options.hands.enabled = true;
options.hands.visualization = true;
// Visualize hand joints.
options.hands.visualizeJoints = true;
// Visualize hand meshes.
options.hands.visualizeMeshes = true;

options.simulator.defaultMode = xb.SimulatorMode.POSE;

function start() {
  xb.add(new HandsInteraction());
  xb.init(options);
}

document.addEventListener('DOMContentLoaded', function() {
  start();
});
