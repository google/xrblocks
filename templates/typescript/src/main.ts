import * as THREE from 'three';
import * as xb from 'xrblocks';

class MainScript extends xb.Script {
  private cube!: THREE.Mesh<THREE.BoxGeometry, THREE.MeshStandardMaterial>;

  override init() {
    this.add(new THREE.HemisphereLight(0xffffff, 0x666666, 3));

    this.cube = new THREE.Mesh(
      new THREE.BoxGeometry(0.3, 0.3, 0.3),
      new THREE.MeshStandardMaterial({color: 0x4285f4})
    );
    this.cube.position.set(0, xb.user.height - 0.3, -xb.user.objectDistance);
    this.add(this.cube);
  }

  override update() {
    this.cube.rotation.y += xb.getDeltaTime();
  }

  override onSelectEnd() {
    this.cube.material.color.set(Math.random() * 0xffffff);
  }

  override dispose() {
    this.cube.geometry.dispose();
    this.cube.material.dispose();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  xb.add(new MainScript());
  xb.init(new xb.Options());
});
