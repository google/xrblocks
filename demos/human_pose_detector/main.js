import 'xrblocks/addons/simulator/SimulatorAddons.js';
import * as xb from 'xrblocks';
import {PoseDisplay} from './PoseDisplay.js';

const options = new xb.Options();
options.enableHumanDetection();

options.setAppTitle('Human Pose Detector Demo');
options.setAppDescription(
  'Tracks real-time human body landmarks, displaying spatial coordinates and debug visualizations.'
);
options.xrButton.showEnterSimulatorButton = true;

function start() {
  const display = new PoseDisplay();

  xb.add(display);
  xb.init(options);
}

document.addEventListener('DOMContentLoaded', function () {
  start();
});
