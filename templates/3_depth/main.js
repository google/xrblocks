import 'xrblocks/addons/simulator/SimulatorAddons.js';

import * as THREE from 'three';
import * as xb from 'xrblocks';

const pawnModelPath = 'arcore_pawn_compressed.glb';

class PawnPlacer extends xb.Script {
  async init() {
    this.addLights();
    await this.loadPawnModel();
  }

  async loadPawnModel() {
    const pawnGltf = await new xb.ModelLoader().load(
        {url: pawnModelPath, renderer: xb.core.renderer});
    pawnGltf.scene.scale.setScalar(0.5);
    this.pawnModel = pawnGltf.scene;
  }

  addLights() {
    const directionalLight = new THREE.DirectionalLight(0xffffff, 2);
    directionalLight.position.set(0, 1, 0);
    this.add(directionalLight);
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    this.add(ambientLight);
  }

  onSelectStart(event) {
    const intersection = xb.user.select(xb.core.depth.depthMesh, event.target);
    if (intersection) {
      this.add(xb.placeObjectAtIntersectionFacingTarget(
          this.pawnModel.clone(), intersection, xb.core.camera));
    }
  }
}

document.addEventListener('DOMContentLoaded', async function() {
  const options = new xb.Options();
  options.reticles.enabled = true;
  options.depth = new xb.DepthOptions(xb.xrDepthMeshOptions);
  await xb.init(options);
  xb.showReticleOnDepthMesh(true);
  xb.add(new PawnPlacer());
});
