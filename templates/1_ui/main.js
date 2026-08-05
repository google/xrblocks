import 'xrblocks/addons/simulator/SimulatorAddons.js';

import * as xb from 'xrblocks';

import {UIManager} from './UIManager.js';

const options = new xb.Options();
options.enableUI();

document.addEventListener('DOMContentLoaded', function () {
  xb.add(new UIManager());
  xb.init(options);
});
