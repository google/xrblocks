import * as xb from 'xrblocks';

import {PhotoTo3D} from './PhotoTo3D.js';

const options = new xb.Options();
options.enableCamera('environment');
options.setAppTitle('Photo to 3D');
options.setAppDescription(
  'Capture a photo with the headset camera and turn it into a point-cloud ' +
    'miniature with MoGe-2 running on-device through LiteRT.js.'
);

xb.add(new PhotoTo3D());
xb.init(options);
