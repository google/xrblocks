import 'xrblocks/addons/simulator/SimulatorAddons.js';

import RAPIER from 'https://cdn.skypack.dev/@dimforge/rapier3d-simd-compat@0.17.0';
import * as xb from 'xrblocks';

import {BallPit} from './BallPit.js';

const depthMeshColliderUpdateFps =
    xb.getUrlParamFloat('depthMeshColliderUpdateFps', 5);

const options = new xb.Options();
options.depth = new xb.DepthOptions(xb.xrDepthMeshPhysicsOptions);
options.depth.depthMesh.updateFullResolutionGeometry = true;
options.depth.depthMesh.colliderUpdateFps = depthMeshColliderUpdateFps;
options.xrButton = {
  ...options.xrButton,
  startText: '<i id="xrlogo"></i> LET THE FUN BEGIN',
  endText: '<i id="xrlogo"></i> MISSION COMPLETE'
};
options.physics.RAPIER = RAPIER;

// Initializes the scene, camera, xrRenderer, controls, and XR button.
async function start() {
  xb.add(new BallPit());
  await xb.init(options);
}

document.addEventListener('DOMContentLoaded', function() {
  start();
});
