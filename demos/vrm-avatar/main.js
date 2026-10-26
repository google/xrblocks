// Provides 2D simulator UI on desktop — always import first.

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
// Occlusion probe (opt-in with ?occlusionProbe=1): a rigid occludable sphere
// beside the avatar, using the same contract as ModelViewer, so a suspected
// occlusion misalignment can be checked against a non-skinned mesh. In the
// desktop simulator it also drops an invisible slab into the simulator's depth
// scene whose top edge passes through the sphere's centre: the visible part of
// the sphere should end exactly at that edge.
// ---------------------------------------------------------------------------
const PROBE_LAYER = 5;
class OcclusionProbe extends xb.Script {
  init({camera}) {
    // Unlit so any colour change across the ball is occlusion, not shading.
    const material = new THREE.MeshBasicMaterial({color: 0xff8800});
    material.transparent = true;
    material.onBeforeCompile = (shader) => {
      xb.OcclusionUtils.addOcclusionToShader(shader);
      xb.core.depth.occludableShaders.add(shader);
    };
    const ball = new THREE.Mesh(
      new THREE.SphereGeometry(0.15, 48, 24),
      material
    );
    ball.name = 'OcclusionProbeBall';
    ball.layers.enable(xb.OCCLUDABLE_ITEMS_LAYER);

    const forward = camera.getWorldDirection(new THREE.Vector3());
    forward.y = 0;
    forward.normalize();
    const right = new THREE.Vector3().crossVectors(
      forward,
      new THREE.Vector3(0, 1, 0)
    );
    const origin = camera.getWorldPosition(new THREE.Vector3());
    origin.y = 0;
    ball.position
      .copy(origin)
      .addScaledVector(forward, 1.8)
      .addScaledVector(right, 0.6);
    ball.position.y = 1.0;
    this.add(ball);

    this._ball = ball;
    this._forward = forward;
    window.__occlusionProbe = {ball, slab: null, forward};
  }

  update() {
    // The simulator (and its depth camera) come up after scripts init, so the
    // slab is created lazily on the first frame they exist.
    if (this._slab !== undefined) return;
    const sim = xb.core.simulator;
    if (!sim?.simulatorScene || !sim.depth?.depthCamera) return;
    const ball = this._ball;
    const forward = this._forward;
    const slab = new THREE.Mesh(
      new THREE.BoxGeometry(0.8, 0.4, 0.02),
      new THREE.MeshBasicMaterial({color: 0x3366cc})
    );
    slab.name = 'OcclusionProbeSlab';
    // Top edge on the eye-to-ball sight line, half a metre before the ball,
    // so the visible part of the ball should end exactly at its centre row.
    const eye = xb.core.camera.getWorldPosition(new THREE.Vector3());
    const eyeToBall = ball.getWorldPosition(new THREE.Vector3()).sub(eye);
    const topEdge = eye
      .clone()
      .addScaledVector(eyeToBall, 1 - 0.5 / eyeToBall.length());
    slab.position.copy(topEdge);
    slab.position.y -= 0.2;
    const facing = eyeToBall.clone().setY(0).normalize();
    slab.quaternion.setFromRotationMatrix(
      new THREE.Matrix4().lookAt(
        facing,
        new THREE.Vector3(),
        new THREE.Vector3(0, 1, 0)
      )
    );
    this._slabTopEdge = topEdge;
    // Seen by the simulator's depth camera only, never by the colour pass.
    slab.layers.set(PROBE_LAYER);
    sim.depth.depthCamera.layers.enable(PROBE_LAYER);
    sim.simulatorScene.add(slab);
    this._slab = slab;
    window.__occlusionProbe.slab = slab;
    window.__occlusionProbe.slabTopEdge = topEdge;
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
document.addEventListener('DOMContentLoaded', async () => {
  xb.add(new SceneSetup());
  if (new URLSearchParams(location.search).has('occlusionProbe')) {
    xb.add(new OcclusionProbe());
  }

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
  options.enableDepth();
  options.enableReticles();
  options.reticles.projectOnDepthMesh = true;
  // Pixel-level occlusion: real-world geometry (desk, doorway, furniture)
  // hides the avatar. Needs the depth texture (occlusion map compares virtual
  // depth against it) plus the occlusion pass itself.
  options.depth.depthTexture.enabled = true;
  options.depth.occlusion.enabled = true;
  options.setAppTitle('VRM Avatar Companion');
  options.setAppDescription(
    'Point at a detected floor surface and release Select to move the avatar.'
  );

  await xb.init(options);
});
