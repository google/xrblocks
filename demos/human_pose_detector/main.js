import * as xb from 'xrblocks';
import {PoseDisplay} from './PoseDisplay.js';
import {CameraPreview} from './CameraPreview.js';

async function start() {
  const options = new xb.Options();
  options.enableHumanDetection();

  // enableHumanDetection() selects the environment camera, which is right on a
  // headset: you are detecting the people in front of you, and they are part of
  // the depth mesh so landmarks project onto their actual bodies.
  //
  // On desktop the simulator answers that same camera with a render of the
  // virtual room, which never contains a person, so detection silently returns
  // nothing. There we want the real webcam, and because you are not standing
  // inside the simulated room, projecting landmarks onto its depth mesh would
  // smear the skeleton across the walls, so that is turned off too.
  const onDevice = await navigator.xr?.isSessionSupported?.('immersive-ar');
  if (!onDevice) {
    // After enableHumanDetection(), which calls enableCamera() internally and
    // would otherwise overwrite this. The simulator camera stays registered
    // because on desktop it is what supplies the camera pose, and without a
    // pose detection is skipped before the model runs.
    options.enableCamera('user');
    options.world.humans.useDepthProjection = false;
  }

  options.setAppTitle('Human Pose Detector Demo');
  options.setAppDescription(
    'Tracks real-time human body landmarks, displaying spatial coordinates and debug visualizations.'
  );
  options.xrButton.showEnterSimulatorButton = true;

  xb.add(new PoseDisplay());
  xb.add(new CameraPreview());
  xb.init(options);
}

document.addEventListener('DOMContentLoaded', function () {
  void start();
});
