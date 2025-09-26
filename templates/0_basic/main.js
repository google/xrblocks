import * as THREE from 'three';
import * as xb from 'xrblocks';

/**
 * A basic example of XRBlocks to render a cylinder and pinch to change color.
 */
class MainScript extends xb.Script {
  init() {
    this.add(new THREE.HemisphereLight(0xffffff, 0x666666, /*intensity=*/ 3));

    const geometry = new THREE.CylinderGeometry(.2, .2, .4, /*segments=*/ 32);
    const material = new THREE.MeshPhongMaterial(
        {color: 0xffffff, transparent: true, opacity: 0.8});
    this.player = new THREE.Mesh(geometry, material);
    this.player.position.set(0, xb.user.height - 0.5, -xb.user.objectDistance);
    this.add(this.player);
  }

  /**
   * Changes the color of the mesh on a pinch in XR.
   * @param {SelectEvent} event event.target holds controler / hand data.
   */
  onSelectEnd(event) {
    this.player.material.color.set(Math.random() * 0xffffff);
  }

  /**
   * Changes the color of the mesh to blue during pinching in XR.
   * @param {SelectEvent} event The controller / hand event.
   */
  onSelecting(event) {
    this.player.material.color.set(0x66ccff);
  }
};

document.addEventListener('DOMContentLoaded', function() {
  xb.add(new MainScript());
  xb.init(new xb.Options());
});
