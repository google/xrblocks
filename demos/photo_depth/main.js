import * as xb from 'xrblocks';

import {PhotoDepth} from './PhotoDepth.js';

const options = new xb.Options();
options.enableCamera('environment');

// Sensed depth is only the reference for the accuracy readout: the photo
// depth itself needs no depth sensor. Turn it off (?sensedDepth=0) to run like
// a depthless device; depth-sensing is a required WebXR feature once enabled.
if (xb.getUrlParamBool('sensedDepth', true)) {
  options.depth = new xb.DepthOptions({
    enabled: true,
    // The depth mesh stays invisible; it is enabled because devices with
    // GPU-only depth (Quest 3) read depth back to the CPU only for it.
    depthMesh: {enabled: true},
  });
}

options.setAppTitle('Photo Depth');
options.setAppDescription(
  'Turn one headset camera photo into world-aligned metric depth with ' +
    'MoGe-2 running on-device through LiteRT.js.'
);

xb.add(new PhotoDepth());
xb.init(options);
