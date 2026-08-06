import 'xrblocks/addons/simulator/SimulatorAddons.js';
import * as xb from 'xrblocks';
import {PoseDisplay} from './PoseDisplay.js';
import {CameraPreview} from './CameraPreview.js';

const options = new xb.Options();
options.enableHumanDetection();

// Pose detection needs to see a real person, and the desktop simulator answers
// the environment camera with a render of the virtual room, which never
// contains one. Asking for the user-facing camera routes the stream at the real
// webcam instead.
//
// This has to come after enableHumanDetection(), which calls enableCamera()
// internally and would otherwise overwrite it. Note the simulator camera stays
// registered: the SDK derives the camera pose from it on desktop, and without
// that pose getCameraParametersSnapshot() returns null and detection is skipped
// before MediaPipe ever runs. On device the simulator never starts, so this is
// desktop-only.
options.enableCamera('user');

options.setAppTitle('Human Pose Detector Demo');
options.setAppDescription(
  'Tracks real-time human body landmarks, displaying spatial coordinates and debug visualizations.'
);
options.xrButton.showEnterSimulatorButton = true;

function start() {
  const display = new PoseDisplay();

  xb.add(display);
  xb.add(new CameraPreview());
  xb.init(options);
}

document.addEventListener('DOMContentLoaded', function () {
  start();
});
