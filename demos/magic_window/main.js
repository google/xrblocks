import 'xrblocks/addons/simulator/SimulatorAddons.js';
import * as xb from 'xrblocks';
import {ControlPanel} from './ControlPanel.js';
import {MagicWindow} from './MagicWindow.js';

const options = new xb.Options();
// Enable the SDK's segmentation primitive (MediaPipe person/background masks).
// It turns the camera on for us; we then override to the user-facing camera so
// there's a person to cut out (on desktop `facingMode: 'user'` skips the
// simulator camera and goes straight to getUserMedia).
options.enableSegmentation();
options.enableCamera('user');
options.setAppTitle('Magic Window');
options.setAppDescription(
  'Segments people out of the camera feed in real time (MediaPipe ' +
    'ImageSegmenter) and composites them onto a swappable backdrop.'
);
options.xrButton.showEnterSimulatorButton = true;

function start() {
  const magicWindow = new MagicWindow();
  xb.add(magicWindow);
  xb.add(new ControlPanel(magicWindow));
  xb.init(options);
}

document.addEventListener('DOMContentLoaded', start);
