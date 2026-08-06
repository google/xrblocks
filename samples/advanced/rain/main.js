import * as xb from 'xrblocks';

import {RainScene} from './RainScene.js';

const depthMeshColliderUpdateFps = xb.getUrlParamFloat(
  'depthMeshColliderUpdateFps',
  30
);

const options = new xb.Options();
options.reticles.enabled = false;
options.depth = new xb.DepthOptions(xb.xrDepthMeshPhysicsOptions);
options.depth.depthMesh.colliderUpdateFps = depthMeshColliderUpdateFps;
options.setAppTitle('Rain');
options.setAppDescription('Bring rain and volumetric clouds into your space.');

// Initializes the scene, camera, xrRenderer, controls, and XR button.
async function start() {
  const rainScene = new RainScene();
  xb.add(rainScene);
  await xb.init(options);
}

document.addEventListener('DOMContentLoaded', function () {
  start();
});
