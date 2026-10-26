import * as xb from 'xrblocks';

import {SuperResolutionDemo} from './SuperResolutionDemo.js';

const options = new xb.Options();
options.enableCamera();

xb.add(new SuperResolutionDemo());
xb.init(options);
