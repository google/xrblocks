import * as xb from 'xrblocks';

import {XRObjectManager} from './XRObjectManager.js';

const options = new xb.Options();
options.enableCamera();
options.deviceCamera.videoConstraints = {
  width: {ideal: 1280},
  height: {ideal: 720},
  facingMode: 'environment',
};
options.reticles.enabled = true;
options.reticles.projectOnDepthMesh = true;
options.reticles.defaultRenderDistance = 8;
options.controllers.visualizeRays = false;
options.enableObjectDetection();
options.enableDepth();
options.depth.depthMesh.updateFullResolutionGeometry = true;
options.depth.depthMesh.renderShadow = true;
options.depth.depthTexture.enabled = false;
options.depth.matchDepthView = false;
options.enableHands();
options.hands.visualization = false;
options.hands.visualizeMeshes = false;
options.sound.speechSynthesizer.enabled = true;
options.sound.speechRecognizer.enabled = true;
options.sound.speechRecognizer.playSimulatorActivationSounds = true;

options.world.objects.backendConfig.activeBackend = 'model';
options.world.objects.showDebugVisualizations = false;
options.setAppTitle('Gemini XR-Objects');
options.setAppDescription(
  'Recognize objects with Gemini and ask questions about them. Perform a long pinch / press to start!'
);
options.xrButton.showEnterSimulatorButton = true;
options.simulator.defaultMode = xb.SimulatorMode.CONTROLLER;

document.addEventListener('DOMContentLoaded', async () => {
  const google = await xb.createGoogle({promptForApiKey: true});
  const model = google('gemini-3.8-flash');
  options.world.objects.backendConfig.model.model = model;
  xb.add(new XRObjectManager(model));
  xb.init(options);
});
