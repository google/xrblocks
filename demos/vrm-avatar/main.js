// Provides 2D simulator UI on desktop — always import first.
import 'xrblocks/addons/simulator/SimulatorAddons.js';

import * as THREE from 'three';
import * as xb from 'xrblocks';

import {VRMAvatarScript} from './VRMAvatarScript.js';

// ---------------------------------------------------------------------------
// Asset URLs — swap these for your own VRM / FBX files.
// VRM: the sample model bundled in the three-vrm repository.
// FBX: free Mixamo downloads (no character needed, just animations).
// ---------------------------------------------------------------------------
const VRM_URL =
  'https://cdn.jsdelivr.net/gh/pixiv/three-vrm@3.5.1/packages/three-vrm-animation/examples/models/VRM1_Constraint_Twist_Sample.vrm';
const ASSETS_BASE_URL =
  'https://cdn.jsdelivr.net/gh/xrblocks/proprietary-assets@main/';
const TPOSE_URL = ASSETS_BASE_URL + 'avatars/Tpose.glb';
const IDLE_URL = ASSETS_BASE_URL + 'avatars/IdleListening.glb';
const WALK_URL = ASSETS_BASE_URL + 'avatars/Walking.glb';

// ---------------------------------------------------------------------------
// Minimal scene setup (lights + ground grid for visual reference)
// ---------------------------------------------------------------------------
class SceneSetup extends xb.Script {
  init() {
    this.add(new THREE.HemisphereLight(0xffffff, 0x666666, 3));

    const dirLight = new THREE.DirectionalLight(0xffffff, 2);
    dirLight.position.set(1, 3, 1).normalize();
    this.add(dirLight);

    // GRID TEST: temporarily removed to check whether rendering the floor grid
    // is responsible for the close-range lag (it's the only scene-graph element
    // this demo has that the smooth depth samples don't).
    // const grid = new THREE.GridHelper(10, 20, 0x888888, 0x444444);
    // grid.position.y = 0;
    // this.add(grid);
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  xb.add(new SceneSetup());

  xb.add(
    new VRMAvatarScript({
      vrmUrl: VRM_URL,
      tposeUrl: TPOSE_URL,
      idleUrl: IDLE_URL,
      walkUrl: WALK_URL,

      rotateLerp: 0.08,
    })
  );

  const options = new xb.Options();
  // Depth mesh: used by VRMAvatarScript.onSelectEnd to pick a walk target on the
  // real-world floor. The mesh is invisible (xrDepthMeshOptions) and downsampled
  // for raycasts, so it's cheap.
  options.enableDepth();
  options.setAppTitle('VRM Avatar Companion');

  await xb.init(options);
});
