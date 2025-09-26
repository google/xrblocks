import 'xrblocks/addons/simulator/SimulatorAddons.js';

import * as xb from 'xrblocks';

import {RainScene} from './RainScene.js';

const depthMeshColliderUpdateFps =
    xb.getUrlParamFloat('depthMeshColliderUpdateFps', 30);

const options = new xb.Options();
options.reticles.enabled = false;
options.depth = new xb.DepthOptions(xb.xrDepthMeshPhysicsOptions);
options.depth.depthMesh.colliderUpdateFps = depthMeshColliderUpdateFps;
options.xrButton.startText = '<i id="xrlogo"></i> MAKE A MESS';
options.xrButton.endText = '<i id="xrlogo"></i> MISSION COMPLETE';

// Initializes the scene, camera, xrRenderer, controls, and XR button.
async function start() {
  const rainScene = new RainScene();
  xb.add(rainScene);
  await xb.init(options);
}

document.addEventListener('DOMContentLoaded', function() {
  start();
});
