import * as THREE from 'three';
import * as xb from 'xrblocks';

class SpatialPlacement extends xb.Script {
  static dependencies = {
    depth: xb.Depth,
    user: xb.User,
  };

  init({depth, user}) {
    this.depth = depth;
    this.user = user;
    this.add(new THREE.HemisphereLight(0xffffff, 0x3c4043, 3));
    this.geometry = new THREE.SphereGeometry(0.08, 32, 16);
    this.previewMaterial = new THREE.MeshStandardMaterial({
      color: 0x4285f4,
      transparent: true,
      opacity: 0.35,
      depthWrite: false,
      roughness: 0.35,
    });
    this.placedMaterial = new THREE.MeshStandardMaterial({
      color: 0x4285f4,
      roughness: 0.35,
    });
    this.sphere = new THREE.Mesh(this.geometry, this.previewMaterial);
    this.sphere.name = 'Depth hit';
    this.sphere.visible = false;
    this.sphere.xb = {pointerEvents: 'none'};
    this.add(this.sphere);

    this.placedSphere = new THREE.Mesh(this.geometry, this.placedMaterial);
    this.placedSphere.name = 'Placed depth hit';
    this.placedSphere.visible = false;
    this.placedSphere.xb = {pointerEvents: 'none'};
    this.add(this.placedSphere);
  }

  update() {
    const hit = this.depth.depthMesh
      ? this.user.getIntersectionAt(this.depth.depthMesh)
      : null;
    this.sphere.visible = Boolean(hit);
    if (hit) this.sphere.position.copy(hit.point);
  }

  onSelectStart(event) {
    if (event.surface !== this.depth.depthMesh || !event.intersection) return;

    this.placedSphere.position.copy(event.intersection.point);
    this.placedSphere.visible = true;
  }

  dispose() {
    this.geometry.dispose();
    this.previewMaterial.dispose();
    this.placedMaterial.dispose();
  }
}

const options = new xb.Options();
options.enableDepth();
options.reticles.projectOnDepthMesh = true;

xb.add(new SpatialPlacement());
xb.init(options);
