import * as THREE from 'three';
import * as xb from 'xrblocks';
import {ModelManager} from 'xrblocks/addons/ui/ModelManager.js';

import {ANIMALS_DATA} from './animals_data.js';

export class LightingScene extends xb.Script {
  constructor() {
    super();
    this.pointer = new THREE.Vector3();
    this.raycaster = new THREE.Raycaster();
    this.modelManager =
        new ModelManager(ANIMALS_DATA, /*enableOcclusion=*/ true);
    this.modelManager.layers.enable(xb.OCCLUDABLE_ITEMS_LAYER);
    this.add(this.modelManager);
  }
  init() {
    xb.core.input.addReticles();
    xb.showReticleOnDepthMesh(true);
  }
  updatePointerPosition(event) {
    // (-1 to +1) for both components
    this.pointer.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.pointer.y = -(event.clientY / window.innerHeight) * 2 + 1;
    // scale pointer.x from [-1, 0] to [-1, 1]
    this.pointer.x = 1 + 2 * this.pointer.x;
  }
  onSelectStart(event) {
    const controller = event.target;
    if (xb.core.input.intersectionsForController.get(controller).length > 0) {
      const intersection =
          xb.core.input.intersectionsForController.get(controller)[0];
      if (intersection.handleSelectRaycast) {
        intersection.handleSelectRaycast(intersection);
        return;
      } else if (intersection.object.handleSelectRaycast) {
        intersection.object.handleSelectRaycast(intersection);
        return;
      } else if (intersection.object == xb.core.depth.depthMesh) {
        this.onDepthMeshSelectStart(intersection);
        return;
      }
    }
  }
  onDepthMeshSelectStart(intersection) {
    console.log('Depth mesh select intersection:', intersection.point);
    this.modelManager.positionModelAtIntersection(intersection, xb.core.camera);
  }
  onPointerDown(event) {
    this.updatePointerPosition(event);
    const cameras = xb.core.renderer.xr.getCamera().cameras;
    if (cameras.length == 0) return;
    const camera = cameras[0];
    this.raycaster.setFromCamera(this.pointer, camera);
    const intersections =
        this.raycaster.intersectObjects(xb.core.input.reticleTargets);
    for (let intersection of intersections) {
      if (intersection.handleSelectRaycast) {
        intersection.handleSelectRaycast(intersection);
        return;
      } else if (intersection.object.handleSelectRaycast) {
        intersection.object.handleSelectRaycast(intersection);
        return;
      } else if (intersection.object == xb.core.depth.depthMesh) {
        this.modelManager.positionModelAtIntersection(intersection, camera);
        return;
      }
    }
  }
}
