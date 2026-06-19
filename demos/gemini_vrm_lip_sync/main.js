// Provides 2D simulator UI on desktop — always import first.
import 'xrblocks/addons/simulator/SimulatorAddons.js';

import * as THREE from 'three';
import * as xb from 'xrblocks';

import {GeminiVRMLipScript} from './GeminiVRMLipScript.js';

// ---------------------------------------------------------------------------
// Asset URLs — same VRM model + idle animation as demos/vrm-avatar.
// ---------------------------------------------------------------------------
const VRM_URL =
  'https://cdn.jsdelivr.net/gh/pixiv/three-vrm@3.5.1/packages/three-vrm-animation/examples/models/VRM1_Constraint_Twist_Sample.vrm';
const ASSETS_BASE_URL =
  'https://cdn.jsdelivr.net/gh/xrblocks/proprietary-assets@main/';
const TPOSE_URL = ASSETS_BASE_URL + 'avatars/Tpose.glb';
const IDLE_URL = ASSETS_BASE_URL + 'avatars/IdleListening.glb';

// ---------------------------------------------------------------------------
// Minimal scene setup (lights + ground grid for visual reference).
// ---------------------------------------------------------------------------
class SceneSetup extends xb.Script {
  init() {
    this.add(new THREE.HemisphereLight(0xffffff, 0x666666, 3));

    const dirLight = new THREE.DirectionalLight(0xffffff, 2);
    dirLight.position.set(1, 3, 1).normalize();
    this.add(dirLight);

    // No floor grid: a screen-spanning GridHelper caused severe close-range lag
    // in XR (see demos/vrm-avatar) and looks out of place against passthrough.
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  xb.add(new SceneSetup());

  xb.add(
    new GeminiVRMLipScript({
      vrmUrl: VRM_URL,
      tposeUrl: TPOSE_URL,
      idleUrl: IDLE_URL,
      spawnDistance: 0.8,
    })
  );

  const options = new xb.Options();
  options.enableAI();
  // Request microphone permission before entering XR.
  options.permissions.microphone = true;
  options.setAppTitle('Gemini VRM Lipsync');

  await xb.init(options);
});
