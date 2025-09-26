import * as xb from 'xrblocks';

import {OcclusionScene} from './OcclusionScene.js';

const options = new xb.Options();
options.reticles.enabled = true;
options.depth = new xb.DepthOptions(xb.xrDepthMeshOptions);
options.depth.depthMesh.updateFullResolutionGeometry = true;
options.depth.depthMesh.renderShadow = true;
options.depth.depthTexture.enabled = true;
options.depth.occlusion.enabled = true;
options.xrButton.startText = '<i id="xrlogo"></i> BRING IT TO LIFE';
options.xrButton.endText = '<i id="xrlogo"></i> MISSION COMPLETE';

async function start() {
  const occlusion = new OcclusionScene();
  await xb.init(options);
  xb.add(occlusion);

  window.addEventListener(
      'pointerdown', occlusion.onPointerDown.bind(occlusion));
}

document.addEventListener('DOMContentLoaded', function() {
  start();
});
