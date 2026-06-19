import 'xrblocks/addons/simulator/SimulatorAddons.js';
import * as xb from 'xrblocks';
import {FaceMirror} from './FaceMirror.js';
import {installWebcamFallback} from './WebcamFallback.js';

const options = new xb.Options();
options.enableFaceDetection();
options.setAppTitle('Face Landmarker Mirror');
options.setAppDescription(
  'Tracks the 478 MediaPipe face landmarks and 52 blendshapes in real time, ' +
    'projects them into the scene as a wireframe with live expression bars.'
);
options.xrButton.showEnterSimulatorButton = true;

function start() {
  const mirror = new FaceMirror();
  xb.add(mirror);
  xb.init(options).then(() => {
    // After xb.init the simulator addon is wired and xb.core.deviceCamera
    // is available, so we can decide whether to inject a webcam stream.
    // On real Quest hardware the device-camera path stays untouched.
    installWebcamFallback(xb);
  });
}

document.addEventListener('DOMContentLoaded', start);
