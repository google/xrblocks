import 'xrblocks/addons/simulator/SimulatorAddons.js';

import RAPIER from 'https://cdn.skypack.dev/@dimforge/rapier3d-simd-compat@0.17.0';
import * as xb from 'xrblocks';

import {SplashScript} from './SplashScript.js';

const depthMeshColliderUpdateFps =
    xb.getUrlParamFloat('depthMeshColliderUpdateFps', 30);
const splashScript = new SplashScript();

let options = new xb.Options();
options.depth = new xb.DepthOptions(xb.xrDepthMeshPhysicsOptions);
options.depth.depthMesh.colliderUpdateFps = depthMeshColliderUpdateFps;
options.xrButton = {
  ...options.xrButton,
  startText: '<i id="xrlogo"></i> MAKE A MESS',
  endText: '<i id="xrlogo"></i> MISSION COMPLETE'
};
options.physics.RAPIER = RAPIER;
options.physics.useEventQueue = true;

// Initializes the scene, camera, xrRenderer, controls, and XR button.
async function start() {
  xb.add(splashScript);
  await xb.init(options);
}

document.addEventListener('DOMContentLoaded', function() {
  start();
});
