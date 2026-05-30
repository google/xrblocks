import 'xrblocks/addons/simulator/SimulatorAddons.js';
import * as xb from 'xrblocks';

import {AudioVisualizer} from './AudioVisualizer.js';

// Configurable via URL params — e.g. ?bars=32&radius=0.8&smoothing=0.5
const numBars = xb.getUrlParamInt('bars', 64);
const radius = xb.getUrlParamFloat('radius', 0.6);
const smoothing = xb.getUrlParamFloat('smoothing', 0.8);

const options = new xb.Options();
options.hands.enabled = true;

// Enable gesture recognition so users can switch modes hands-free.
// fist → bars | point → wave | spread → sphere | thumbs-up → cycle theme
options.enableGestures();
options.gestures.setGestureEnabled('fist', true);
options.gestures.setGestureEnabled('point', true);
options.gestures.setGestureEnabled('spread', true);
options.gestures.setGestureEnabled('thumbs-up', true);

options.setAppTitle('Audio Visualizer');
options.setAppDescription(
  'Real-time 3D audio visualization — bars, waveform ring, and pulse sphere. ' +
  'Gestures: fist=bars, point=wave, spread=sphere, thumbs-up=theme.'
);
options.xrButton.showEnterSimulatorButton = true;

document.addEventListener('DOMContentLoaded', () => {
  xb.add(new AudioVisualizer({numBars, radius, smoothing}));
  xb.init(options);
});
