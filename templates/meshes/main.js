import 'xrblocks/addons/simulator/SimulatorAddons.js';

import * as xb from 'xrblocks';

document.addEventListener('DOMContentLoaded', async function () {
  const options = new xb.Options();
  options.reticles.enabled = true;
  options.world.enableMeshDetection();
  options.world.meshes.showDebugVisualizations = true;
  await xb.init(options);
});
