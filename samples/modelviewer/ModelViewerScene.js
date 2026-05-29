import * as THREE from 'three';
import * as xb from 'xrblocks';

const kLightX = xb.getUrlParamFloat('lightX', 0);
const kLightY = xb.getUrlParamFloat('lightY', 500);
const kLightZ = xb.getUrlParamFloat('lightZ', -10);

const ASSETS_BASE_URL = 'https://cdn.jsdelivr.net/gh/xrblocks/assets@main/';
const PROPRIETARY_ASSETS_BASE_URL =
  'https://cdn.jsdelivr.net/gh/xrblocks/proprietary-assets@main/';

export class ModelViewerScene extends xb.Script {
  loadedObjects = [];
  placedObjects = new Set();
  sessionStarted = false;
  torusMesh = null;

  async init() {
    xb.core.input.addReticles();
    this.addLights();
    this.createModelFromObject();
    return Promise.all([
      this.createModelFromGLTF(),
      this.createModelFromAnimatedGLTF(),
      this.createModelFromSplat(),
      this.createModelInPanel(),
    ]);
  }

  addLights() {
    this.add(new THREE.HemisphereLight(0xbbbbbb, 0x888888, 3));
    const light = new THREE.DirectionalLight(0xffffff, 2);
    light.position.set(kLightX, kLightY, kLightZ);
    this.add(light);
  }

  update() {
    if (this.torusMesh) {
      this.torusMesh.rotation.x += 0.015;
      this.torusMesh.rotation.y += 0.015;
    }
  }

  onSimulatorStarted() {
    this.onXRSessionStarted();
  }

  onXRSessionStarted() {
    this.sessionStarted = true;
    this.placeLoadedObjects();
  }

  placeLoadedObjects() {
    for (const model of this.loadedObjects) {
      this.placeObject(model);
    }
  }

  placeObject(model) {
    if (!this.sessionStarted || this.placedObjects.has(model)) return;
    this.placedObjects.add(model);
    return xb.world.placeOnHorizontalSurface(
      model,
      /*timeout*/ {
        seconds: 30,
      }
    );
  }

  createModelFromObject() {
    const model = new xb.ModelViewer({});
    const torusMesh = new THREE.Mesh(
      new THREE.TorusKnotGeometry(0.1, 0.03, 100, 16),
      new THREE.MeshPhongMaterial({
        color: 0x34a853,
        shininess: 30,
        specular: 0x888888,
      })
    );
    this.torusMesh = torusMesh;
    model.add(torusMesh);
    model.setupBoundingBox();
    model.setupRaycastCylinder();
    model.setupPlatform();
    model.position.set(-0.6, 0.5, -1.5);
    this.add(model);
    this.loadedObjects.push(model);
    this.placeObject(model);
  }

  async createModelFromGLTF() {
    const model = new xb.ModelViewer({});
    this.add(model);
    await model.loadGLTFModel({
      data: {
        scale: {x: 0.009, y: 0.009, z: 0.009},
        path: PROPRIETARY_ASSETS_BASE_URL,
        model: 'chess/chess_compressed.glb',
      },
      renderer: xb.core.renderer,
    });
    model.position.set(-0.2, 0.5, -1.5);
    this.loadedObjects.push(model);
    this.placeObject(model);
  }

  async createModelFromAnimatedGLTF() {
    const model = new xb.ModelViewer({});
    this.add(model);
    await model.loadGLTFModel({
      data: {
        scale: {x: 1.0, y: 1.0, z: 1.0},
        path: ASSETS_BASE_URL,
        model: 'models/Cat/cat.gltf',
      },
      renderer: xb.core.renderer,
    });
    model.position.set(0.9, 0.68, -0.95);
  }

  async createModelFromSplat() {
    const model = new xb.ModelViewer({castShadow: false, receiveShadow: false});
    this.add(model);
    await model.loadSplatModel({
      data: {
        model: PROPRIETARY_ASSETS_BASE_URL + 'lego/lego.spz',
        scale: {x: 0.6, y: 0.6, z: 0.6},
        rotation: {x: 0, y: 180, z: 0},
      },
    });
    model.position.set(0.6, 0.5, -1.5);
    this.loadedObjects.push(model);
    this.placeObject(model);
  }

  async createModelInPanel() {
    const panel = new xb.SpatialPanel({
      backgroundColor: '#00000000',
      width: 0.6,
      height: 0.6,
      useDefaultPosition: false,
    });
    panel.isRoot = true;
    this.add(panel);
    panel.position.set(0, 1.5, -2.0);

    panel.updateLayouts();

    const model = new xb.ModelViewer({});
    panel.add(model);
    await model.loadGLTFModel({
      data: {
        scale: {x: 0.002, y: 0.002, z: 0.002},
        rotation: {x: 0, y: 180, z: 0},
        path: PROPRIETARY_ASSETS_BASE_URL,
        model: 'earth/Earth_1_12756.glb',
      },
      setupPlatform: false,
      renderer: xb.core.renderer,
    });
    // Position and scale the model to fill a 1x1x1 space uniformly, centered on the panel.
    const size = new THREE.Vector3();
    model.bbox.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim > 0) {
      model.scale.setScalar(1 / maxDim);
      model.position.set(0, -(size.y / 2) / maxDim, 0);
    }
  }
}
