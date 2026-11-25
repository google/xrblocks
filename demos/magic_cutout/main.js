import * as xb from 'xrblocks';

import {MagicCutoutDemo} from './MagicCutoutDemo.js';

const options = new xb.Options();
options.enableCamera();
options.enableDepth();
options.enableHands();

xb.add(new MagicCutoutDemo());
await xb.init(options);
