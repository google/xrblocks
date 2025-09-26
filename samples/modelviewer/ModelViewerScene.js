import * as THREE from 'three';
import * as xb from 'xrblocks';

const kLightX = xb.getUrlParamFloat('lightX', 0);
const kLightY = xb.getUrlParamFloat('lightY', 500);
const kLightZ = xb.getUrlParamFloat('lightZ', -10);

const ASSETS_BASE_URL = 'https://cdn.jsdelivr.net/gh/xrblocks/assets@main/';
const PROPRIETARY_ASSETS_BASE_URL =
    'https://cdn.jsdelivr.net/gh/xrblocks/proprietary-assets@main/';

export class ModelViewerScene extends xb.Script {
  constructor() {
    super();
  }

  async init() {
    xb.core.input.addReticles();
    this.addLights();
    this.createModelFromObject();
    await Promise.all([
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

  createModelFromObject() {
    const model = new xb.ModelViewer({});
    model.add(new THREE.Mesh(
        new THREE.CylinderGeometry(0.15, 0.15, 0.4),
        new THREE.MeshPhongMaterial({color: 0xdb5461})));
    model.setupBoundingBox();
    model.setupRaycastCylinder();
    model.setupPlatform();
    model.position.set(-0.15, 0.75, -1.65);
    this.add(model);
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
      renderer: xb.core.renderer
    });
    model.position.set(0, 0.78, -1.1);
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
    model.position.set(0.4, 0.78, -1.1);
    model.rotation.set(0, -Math.PI / 6, 0);
  }

  async createModelInPanel() {
    const panel = new xb.SpatialPanel({
      backgroundColor: '#00000000',
      width: 0.5,
      height: 0.25,
      useDefaultPosition: false
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
      renderer: xb.core.renderer
    });
  }
}
