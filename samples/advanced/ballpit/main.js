import RAPIER from '@dimforge/rapier3d-simd-compat';
import * as xb from 'xrblocks';

import {BallPit} from './BallPit.js';

const depthMeshColliderUpdateFps = xb.getUrlParamFloat(
  'depthMeshColliderUpdateFps',
  5
);

const useSceneMesh = xb.getUrlParamBool('scenemesh', false);
const sceneMeshDebug = xb.getUrlParamBool('scenemeshdebug', false);

const options = new xb.Options();
if (useSceneMesh) {
  options.world.enableMeshDetection();
  options.world.meshes.showDebugVisualizations = sceneMeshDebug;
} else {
  options.depth = new xb.DepthOptions(xb.xrDepthMeshPhysicsOptions);
  options.depth.depthMesh.colliderUpdateFps = depthMeshColliderUpdateFps;
  options.depth.matchDepthView = false;
}
options.reticles.enabled = false;
options.interaction.raycastMode = 'select';
options.physics.RAPIER = RAPIER;
options.setAppTitle('Ballpit');
options.setAppDescription('Fill your room with bouncing physics balls.');

// Initializes the scene, camera, xrRenderer, controls, and XR button.
async function start() {
  xb.add(new BallPit());
  await xb.init(options);
}

document.addEventListener('DOMContentLoaded', function () {
  start();
});
