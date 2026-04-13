import 'xrblocks/addons/simulator/SimulatorAddons.js';
import {LongSelectHandler} from 'xrblocks/addons/ui/LongSelectHandler.js';

import * as xb from 'xrblocks';

import {XRObjectManager} from './XRObjectManager.js';

const options = new xb.Options();
options.deviceCamera.enabled = true;
options.deviceCamera.videoConstraints = {
  width: {ideal: 1280},
  height: {ideal: 720},
  facingMode: 'environment',
};
options.permissions.camera = true;
options.reticles.enabled = false;
options.controllers.visualizeRays = false;
options.world.enableObjectDetection();
options.depth.enabled = true;
options.depth.depthMesh.enabled = true;
options.depth.depthMesh.updateFullResolutionGeometry = true;
options.depth.depthMesh.renderShadow = true;
options.depth.depthTexture.enabled = false;
options.depth.matchDepthView = false;
options.hands.enabled = true;
options.hands.visualization = false;
options.hands.visualizeMeshes = false;
options.sound.speechSynthesizer.enabled = true;
options.sound.speechRecognizer.enabled = true;
options.sound.speechRecognizer.playSimulatorActivationSounds = true;

// options.ai.gemini.config is dynamic and defined in XRObjectManager. A Gemini
// API key needs to be provided in the URL: /gemini_xrobject/index.html?key=...
// or provided with `keys.json` in the same directory.
options.ai.enabled = true;
options.ai.gemini.enabled = true;
options.ai.gemini.model = 'gemini-2.5-flash';
options.world.objects.backendConfig.activeBackend = 'gemini';
options.world.objects.showDebugVisualizations = false;
options.setAppTitle('Gemini XR-Objects');
options.setAppDescription(
  'Recognize objects with Gemini and ask questions about them. Perform a long pinch / press to start!'
);
options.xrButton.showEnterSimulatorButton = true;

function start() {
  const xrObjectManager = new XRObjectManager();
  const longSelectHandler = new LongSelectHandler(
    xrObjectManager.queryObjectionDetection.bind(xrObjectManager)
  );
  xb.add(xrObjectManager);
  xb.add(longSelectHandler);
  xb.init(options);
}

document.addEventListener('DOMContentLoaded', function () {
  start();
});
