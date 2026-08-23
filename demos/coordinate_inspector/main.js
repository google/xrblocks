import * as THREE from 'three';
import * as xb from 'xrblocks';

const position = new THREE.Vector3();

function format({x, y, z}) {
  return `(${x.toFixed(2)}, ${y.toFixed(2)}, ${z.toFixed(2)})`;
}

class CoordinateInspector extends xb.Script {
  init() {
    this.output = document.querySelector('#coordinates');
  }

  update() {
    xb.camera.getWorldPosition(position);

    const sceneMesh = xb.world.meshes;
    const hit = sceneMesh
      ? xb.user.controllers
          .map((_, index) => xb.user.getIntersectionAt(sceneMesh, index))
          .filter(Boolean)
          .sort((a, b) => a.distance - b.distance)[0]
      : null;

    this.output.textContent =
      `User:    ${format(position)}\n` +
      `Mesh hit: ${hit ? format(hit.point) : 'no surface'}`;
  }
}

const options = new xb.Options();
options.setAppTitle('Coordinate Inspector');
options.formFactor = 'desktop';
options.world.enableMeshDetection();
options.enableReticles();
options.controllers.visualizeRays = true;
options.simulator.navMesh.enabled = true;

xb.add(new CoordinateInspector());
await xb.init(options);
