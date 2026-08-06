import * as xb from 'xrblocks';

import {PortalGalleryScene} from './PortalGalleryScene.js';

const options = new xb.Options();
options.reticles.enabled = true;
options.reticles.projectOnDepthMesh = true;
options.setAppTitle('Portal Gallery');
options.setAppDescription('Pick up a portal, place it, and walk through.');

// Real-world depth mesh so the portal can be placed on a wall/floor and the
// galaxy hides behind real geometry around the rim.
options.depth = new xb.DepthOptions(xb.xrDepthMeshOptions);
options.depth.depthTexture.enabled = true;
options.depth.occlusion.enabled = true;

async function start() {
  xb.add(new PortalGalleryScene());
  await xb.init(options);
}

document.addEventListener('DOMContentLoaded', start);
