import * as xb from 'xrblocks';

import {Math3D} from './Math3D.js'

const options = new xb.Options()
options.reticles.enabled = true;
options.visualizeRays = true;

function start() {
  xb.add(new Math3D());
  xb.init(options);
}

document.addEventListener('DOMContentLoaded', function() {
  start();
});
