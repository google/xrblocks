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
  globe = null;

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
    if (this.globe) this.globe.rotation.y += 0.005;
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
    const model = new xb.ModelViewer();
    const torusMesh = new THREE.Mesh(
      new THREE.TorusKnotGeometry(0.1, 0.03, 100, 16),
      new THREE.MeshPhongMaterial({
        color: 0x34a853,
        shininess: 30,
        specular: 0x888888,
      })
    );
    this.torusMesh = torusMesh;
    model.setContent(torusMesh);
    model.position.set(-0.6, 0.5, -1.5);
    this.add(model);
    this.loadedObjects.push(model);
    this.placeObject(model);
  }

  async createModelFromGLTF() {
    const model = new xb.ModelViewer();
    this.add(model);
    await model.load({
      url: 'chess/chess_compressed.glb',
      path: PROPRIETARY_ASSETS_BASE_URL,
      scale: 0.009,
    });
    model.position.set(-0.2, 0.5, -1.5);
    this.loadedObjects.push(model);
    this.placeObject(model);
  }

  async createModelFromAnimatedGLTF() {
    const model = new xb.ModelViewer();
    this.add(model);
    await model.load({
      url: 'models/Cat/cat.gltf',
      path: ASSETS_BASE_URL,
    });
    model.position.set(0.9, 0.68, -0.95);
  }

  async createModelFromSplat() {
    const model = new xb.ModelViewer({castShadow: false, receiveShadow: false});
    this.add(model);
    await model.load({
      url: PROPRIETARY_ASSETS_BASE_URL + 'lego/lego.spz',
      scale: 0.6,
      rotation: {x: 0, y: Math.PI, z: 0},
    });
    model.position.set(0.6, 0.5, -1.5);
    this.loadedObjects.push(model);
    this.placeObject(model);
  }

  async createModelInPanel() {
    const modelGroup = new THREE.Group();
    modelGroup.position.set(0, 1.5, -2.0);
    this.add(modelGroup);

    const model = new xb.ModelViewer({
      manipulation: false,
      origin: 'center',
    });
    modelGroup.add(model);
    await model.load({
      url: 'earth/Earth_1_12756.glb',
      path: PROPRIETARY_ASSETS_BASE_URL,
      scale: 0.002,
      rotation: {x: 0, y: Math.PI, z: 0},
    });
    // Position and scale the model to fill a 1x1x1 space uniformly, centered on the panel.
    const size = new THREE.Box3()
      .setFromObject(model)
      .getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);
    if (maxDim > 0) {
      model.scale.setScalar(1 / maxDim);
      model.position.set(0, -(size.y / 2) / maxDim, 0);
    }
    model.manipulation = {
      actions: {rotate: {axis: 'y'}},
      handle: {action: 'rotate'},
    };
    this.globe = model;
  }
}
