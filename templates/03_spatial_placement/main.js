import * as THREE from 'three';
import * as xb from 'xrblocks';

class SpatialPlacement extends xb.Script {
  init() {
    this.add(new THREE.HemisphereLight(0xffffff, 0x3c4043, 3));
    this.object = new THREE.Mesh(
      new THREE.CylinderGeometry(0.09, 0.12, 0.22, 32),
      new THREE.MeshStandardMaterial({color: 0x4285f4, roughness: 0.35})
    );
    this.object.name = 'Placed object';
    this.object.position.set(0, -10, 0);
    this.add(this.object);
    void xb.world
      .placeOnHorizontalSurface(this.object)
      .then((placed) => (this.object.visible = placed));
  }

  dispose() {
    this.object.geometry.dispose();
    this.object.material.dispose();
  }
}

const options = new xb.Options();
options.enableDepth();
options.enablePlaneDetection();

xb.add(new SpatialPlacement());
xb.init(options);
