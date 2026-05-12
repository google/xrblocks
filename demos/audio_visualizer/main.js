import 'xrblocks/addons/simulator/SimulatorAddons.js';
import * as xb from 'xrblocks';

import {AudioVisualizer} from './AudioVisualizer.js';

const options = new xb.Options();
options.hands.enabled = true;

options.setAppTitle('Audio Visualizer');
options.setAppDescription(
  'Real-time 3D frequency visualization from microphone input.'
);
options.xrButton.showEnterSimulatorButton = true;

document.addEventListener('DOMContentLoaded', () => {
  xb.add(new AudioVisualizer());
  xb.init(options);
});
