import 'xrblocks/addons/simulator/SimulatorAddons.js';

import * as xb from 'xrblocks';

import {TriggerManager} from './TriggerManager.js';
import {XRObjectManager} from './XRObjectManager.js';

const options = new xb.Options();
options.deviceCamera.enabled = true;
options.deviceCamera.videoConstraints = {
  width: {ideal: 640},
  height: {ideal: 480},
  facingMode: 'environment',
};
options.permissions.camera = true;
options.reticles.enabled = false;
options.controllers.visualizeRays = false;
options.world.enableObjectDetection();
options.depth.enabled = true;
options.depth.depthMesh.updateFullResolutionGeometry = true;
options.depth.depthMesh.renderShadow = true;
options.depth.depthTexture.enabled = true;
options.hands.enabled = true;
options.hands.visualization = false;
options.hands.visualizeMeshes = false;
options.sound.speechSynthesizer.enabled = true;
options.sound.speechRecognizer.enabled = true;
options.sound.speechRecognizer.playSimulatorActivationSounds = true;

// options.ai.gemini.config is dynamic and defined in XRObjectManager. A Gemini
// API key needs to be provided in the URL: /gemini-xrobject/index.html?key=...
options.ai.enabled = true;
options.ai.gemini.enabled = true;
options.ai.gemini.model = 'gemini-2.5-flash';

function start() {
  const xrObjectManager = new XRObjectManager();
  const triggerManager = new TriggerManager(
    xrObjectManager.queryObjectionDetection.bind(xrObjectManager)
  );
  xb.add(xrObjectManager);
  xb.add(triggerManager);
  xb.init(options);
}

document.addEventListener('DOMContentLoaded', function () {
  start();
});
