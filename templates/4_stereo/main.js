import 'xrblocks/addons/simulator/SimulatorAddons.js';

import * as THREE from 'three';
import * as xb from 'xrblocks';

const stereoTextureFile = 'SV_20241216_144600.webp';

class StereoImage extends xb.Script {
  async init() {
    await this.addStereoQuad();
  }

  async addStereoQuad() {
    const stereoObject = new THREE.Group();
    const [leftTexture, rightTexture] =
        await xb.loadStereoImageAsTextures(stereoTextureFile);
    const geometry = new THREE.PlaneGeometry(1, 1);
    const leftMesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
      map: leftTexture,
      side: THREE.DoubleSide,
    }));

    xb.showOnlyInLeftEye(leftMesh);
    stereoObject.add(leftMesh);
    const rightMesh = new THREE.Mesh(geometry, new THREE.MeshBasicMaterial({
      map: rightTexture,
      side: THREE.DoubleSide,
    }));

    xb.showOnlyInRightEye(rightMesh);
    stereoObject.add(rightMesh);
    stereoObject.position.set(0.0, 1.5, -1.5);
    this.add(stereoObject);
  }
};

document.addEventListener('DOMContentLoaded', function() {
  const options = new xb.Options();
  options.simulator.stereo.enabled = true;
  xb.add(new StereoImage());
  xb.init(options);
});
