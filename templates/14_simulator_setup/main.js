import * as THREE from 'three';
import * as xb from 'xrblocks';

class SimulatorScene extends xb.Script {
  init() {
    this.add(new THREE.HemisphereLight(0xffffff, 0x445566, 2));
    this.object = new THREE.Mesh(
      new THREE.BoxGeometry(0.25, 0.25, 0.25),
      new THREE.MeshStandardMaterial({color: 0x6ad9ff})
    );
    this.object.position.set(0, 1.4, -1.2);
    this.add(this.object);
  }

  update(time) {
    this.object.rotation.y = time * 0.001;
  }

  dispose() {
    this.object.geometry.dispose();
    this.object.material.dispose();
  }
}

const options = new xb.Options();
options.formFactor = 'desktop';
options.enableHands();
options.enablePlaneDetection();
options.controllers.visualization = true;
options.controllers.visualizeRays = true;
options.world.planes.showDebugVisualizations = true;
options.simulator.modeToggle.enabled = true;
options.simulator.navMesh.enabled = true;
options.simulator.navMesh.showDebugVisualizations = true;

xb.add(new SimulatorScene());
await xb.init(options);
