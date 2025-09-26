import * as THREE from 'three';
import * as xb from 'xrblocks';
import {ModelManager} from 'xrblocks/addons/ui/ModelManager.js';

import {ANIMALS_DATA} from './animals_data.js';
import {DepthMeshClone} from './DepthMeshClone.js';

const kLightX = xb.getUrlParamFloat('lightX', 0);
const kLightY = xb.getUrlParamFloat('lightY', 500);
const kLightZ = xb.getUrlParamFloat('lightZ', -10);

export class OcclusionScene extends xb.Script {
  constructor() {
    super();
    this.pointer = new THREE.Vector3();
    this.depthMeshClone = new DepthMeshClone();
    this.raycaster = new THREE.Raycaster();
    this.modelManager =
        new ModelManager(ANIMALS_DATA, /*enableOcclusion=*/ true);
    this.modelManager.layers.enable(xb.OCCLUDABLE_ITEMS_LAYER);
    this.add(this.modelManager);
    this.instructionText =
        'Pinch on the environment and try hiding the cat behind sofa!';
    this.instructionCol = null;
  }

  init() {
    this.addLights();
    xb.showReticleOnDepthMesh(true);
    this.addPanel();
  }

  addPanel() {
    const panel = new xb.SpatialPanel({
      backgroundColor: '#00000000',
      useDefaultPosition: false,
      showEdge: false
    });
    panel.position.set(0, 1.6, -1.0);
    panel.isRoot = true;
    this.add(panel);

    const grid = panel.addGrid();
    grid.addRow({weight: 0.05});
    // Space for orbiter
    grid.addRow({weight: 0.1});

    const controlRow = grid.addRow({weight: 0.3});
    const ctrlPanel = controlRow.addPanel({backgroundColor: '#000000bb'});
    const ctrlGrid = ctrlPanel.addGrid();

    const midColumn = ctrlGrid.addCol({weight: 0.9});
    midColumn.addRow({weight: 0.3});
    const gesturesRow = midColumn.addRow({weight: 0.4});
    gesturesRow.addCol({weight: 0.05});

    const textCol = gesturesRow.addCol({weight: 1.0});
    this.instructionCol = textCol.addRow({weight: 1.0}).addText({
      text: `${this.instructionText}`,
      fontColor: '#ffffff',
      fontSize: 0.05
    });

    gesturesRow.addCol({weight: 0.01});
    midColumn.addRow({weight: 0.1});

    const orbiter = ctrlGrid.addOrbiter();
    orbiter.addExitButton();

    panel.updateLayouts();

    this.panel = panel;
    this.frameId = 0;
  }

  onSimulatorStarted() {
    this.instructionText =
        'Click on the environment and try hiding the cat behind sofa!';
    if (this.instructionCol) {
      this.instructionCol.setText(this.instructionText);
    }
  }

  addLights() {
    this.add(new THREE.HemisphereLight(0xbbbbbb, 0x888888, 3));
    const light = new THREE.DirectionalLight(0xffffff, 2);
    light.position.set(kLightX, kLightY, kLightZ);
    light.castShadow = true;
    light.shadow.mapSize.width = 2048;   // Default is usually 1024
    light.shadow.mapSize.height = 2048;  // Default is usually 1024
    this.add(light);
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
