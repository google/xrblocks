import * as xb from 'xrblocks';
import RAPIER from '@dimforge/rapier3d-simd-compat';
import 'xrblocks/addons/simulator/SimulatorAddons.js';
import {BalloonGame, GROUP_WORLD} from './BalloonPop.js';

document.addEventListener('DOMContentLoaded', () => {
  const o = new xb.Options();
  o.enableUI();
  o.physics.RAPIER = RAPIER;
  o.physics.useEventQueue = true;
  o.physics.worldStep = true;
  o.hands.enabled = true;
  o.simulator.defaultMode = xb.SimulatorMode.USER;

  // START DISABLED to avoid Simulator Camera-Clone Crash
  o.depth.enabled = false;
  if (o.depth.depthMesh) {
    o.depth.depthMesh.enabled = true;
    o.depth.depthMesh.physicsEnabled = true;
    o.depth.depthMesh.collisionGroups = GROUP_WORLD;
    o.depth.depthMesh.colliderUpdateFps = 5;
  }

  xb.add(new BalloonGame());
  xb.init(o);
});
