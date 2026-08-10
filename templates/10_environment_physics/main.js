import RAPIER from '@dimforge/rapier3d-simd-compat';
import * as xb from 'xrblocks';

import {EnvironmentProjectileDemo} from './EnvironmentProjectileDemo.js';

const options = new xb.Options();
options.physics.RAPIER = RAPIER;
options.depth = new xb.DepthOptions(xb.xrDepthMeshPhysicsOptions);
options.xrButton.showEnterSimulatorButton = true;
options.xrButton.appTitle = 'Environment physics';
options.xrButton.appDescription =
  'Launch projectiles that collide with the depth mesh.';

document.addEventListener('DOMContentLoaded', async () => {
  xb.add(new EnvironmentProjectileDemo());
  await xb.init(options);
});
