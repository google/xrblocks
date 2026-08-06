import RAPIER from '@dimforge/rapier3d-simd-compat';
import * as xb from 'xrblocks';

import {SplashScript} from './SplashScript.js';

const depthMeshColliderUpdateFps = xb.getUrlParamFloat(
  'depthMeshColliderUpdateFps',
  30
);
const splashScript = new SplashScript();

const options = new xb.Options();
options.depth = new xb.DepthOptions(xb.xrDepthMeshPhysicsOptions);
options.depth.depthMesh.colliderUpdateFps = depthMeshColliderUpdateFps;
options.reticles.enabled = true;
options.reticles.projectOnDepthMesh = true;
options.physics.RAPIER = RAPIER;
options.physics.useEventQueue = true;
options.setAppTitle('Splash');
options.setAppDescription('Launch paintballs and cover the room in color.');

// Initializes the scene, camera, xrRenderer, controls, and XR button.
async function start() {
  xb.add(splashScript);
  await xb.init(options);
}

document.addEventListener('DOMContentLoaded', function () {
  start();
});
