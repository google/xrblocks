import * as xb from 'xrblocks';

import {OcclusionScene} from './OcclusionScene.js';

const options = new xb.Options();
options.reticles.enabled = true;
options.reticles.projectOnDepthMesh = true;
options.enableDepth();
options.depth.depthMesh.updateFullResolutionGeometry = true;
options.depth.depthMesh.depthMeshUpdateFps = 15;
options.depth.depthMesh.renderShadow = true;
options.depth.occlusion.enabled = true;
options.setAppTitle('Occlusion');

async function start() {
  const occlusion = new OcclusionScene();
  xb.add(occlusion);
  await xb.init(options);
}

document.addEventListener('DOMContentLoaded', function () {
  start();
});
