import 'xrblocks/addons/simulator/SimulatorAddons.js';
import * as xb from 'xrblocks';
import {ControlPanel} from './ControlPanel.js';
import {MagicWindow} from './MagicWindow.js';

const options = new xb.Options();
// The device camera feeds the segmenter, so we want a person in frame. The
// user-facing mode pulls the real webcam through the camera module (on desktop
// `facingMode: 'user'` skips the simulator camera and goes straight to
// getUserMedia), giving an actual person to cut out.
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
