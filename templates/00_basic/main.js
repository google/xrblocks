import * as THREE from 'three';
import * as xb from 'xrblocks';

class BasicScene extends xb.Script {
  init() {
    this.add(new THREE.HemisphereLight(0xffffff, 0x666666, /*intensity=*/ 3));

    const geometry = new THREE.CylinderGeometry(
      0.2,
      0.2,
      0.4,
      /*segments=*/ 32
    );
    const material = new THREE.MeshPhongMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.8,
    });
    this.object = new THREE.Mesh(geometry, material);
    this.object.name = 'Color cylinder';
    this.object.position.set(0, xb.user.height - 0.5, -xb.user.objectDistance);
    this.add(this.object);
  }

  onSelectEnd() {
    this.object.material.color.set(Math.random() * 0xffffff);
  }

  onSelecting() {
    this.object.material.color.set(0x66ccff);
  }

  dispose() {
    this.object.geometry.dispose();
    this.object.material.dispose();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  xb.add(new BasicScene());
  xb.init(new xb.Options());
});
