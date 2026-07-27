import RAPIER from '@dimforge/rapier3d-simd-compat';
import * as THREE from 'three';
import * as xb from 'xrblocks';
import 'xrblocks/addons/simulator/SimulatorAddons.js';

const detectButton = document.querySelector('#detect');
const resetButton = document.querySelector('#reset');
const meshesButton = document.querySelector('#meshes');
const planesButton = document.querySelector('#planes');
const navMeshButton = document.querySelector('#navmesh');
const depthCanvas = document.querySelector('#depth-preview');
const depthContext = depthCanvas.getContext('2d');
depthContext.imageSmoothingEnabled = false;

class SimulatorSceneObjectsDemo extends xb.Script {
  dynamicBox = null;
  detectionMarkers = new THREE.Group();
  planeLabels = [];
  depthImageData = null;
  lastDepthPreviewTime = 0;

  constructor() {
    super();
    this.detectionMarkers.name = 'Simulator Detection Markers';
  }

  onSimulatorStarted() {
    void this.setupObjects();
  }

  async setupObjects() {
    xb.core.simulator.simulatorScene.add(this.detectionMarkers);
    this.addPlaneLabels();
    const floatingTorus = new THREE.Mesh(
      new THREE.TorusKnotGeometry(0.3, 0.1, 96, 12),
      new THREE.MeshStandardMaterial({color: 0xffca28, roughness: 0.35})
    );
    const fixedCylinder = new THREE.Mesh(
      new THREE.CylinderGeometry(0.35, 0.45, 1, 24),
      new THREE.MeshStandardMaterial({color: 0x66bb6a, roughness: 0.55})
    );
    this.dynamicBox = this.createDynamicBox();

    await xb.core.simulator.objects.addObjects([
      {
        id: 'floating-torus',
        object: floatingTorus,
        position: [0.45, 1.2, 0.5],
        physics: false,
        detectObject: true,
        label: 'floating torus',
        data: {physicsMode: false},
      },
      {
        id: 'fixed-cylinder',
        object: fixedCylinder,
        position: [1.6, 0.5, 0.5],
        physics: 'fixed',
        detectObject: true,
        label: 'fixed cylinder',
        data: {physicsMode: 'fixed'},
      },
      this.dynamicDefinition(this.dynamicBox),
    ]);

    this.tintDetectedMeshes();
    detectButton.disabled = false;
    resetButton.disabled = false;
    meshesButton.disabled = false;
    planesButton.disabled = false;
    navMeshButton.disabled = false;
  }

  update() {
    const now = performance.now();
    if (now - this.lastDepthPreviewTime < 100) return;
    this.lastDepthPreviewTime = now;

    const depth = xb.core.simulator.depth;
    if (!depth.depthBuffer?.length) return;
    if (
      depthCanvas.width !== depth.depthWidth ||
      depthCanvas.height !== depth.depthHeight
    ) {
      depthCanvas.width = depth.depthWidth;
      depthCanvas.height = depth.depthHeight;
      this.depthImageData = null;
    }
    this.depthImageData ??= depthContext.createImageData(
      depth.depthWidth,
      depth.depthHeight
    );

    const pixels = this.depthImageData.data;
    for (let i = 0; i < depth.depthBuffer.length; i++) {
      const meters = depth.depthBuffer[i];
      const intensity =
        Number.isFinite(meters) && meters > 0
          ? Math.round(255 * (1 - Math.min(meters / 8, 1)))
          : 0;
      const offset = i * 4;
      pixels[offset] = intensity;
      pixels[offset + 1] = intensity;
      pixels[offset + 2] = intensity;
      pixels[offset + 3] = 255;
    }
    depthContext.putImageData(this.depthImageData, 0, 0);
  }

  createDynamicBox() {
    return new THREE.Mesh(
      new THREE.BoxGeometry(0.25, 0.25, 0.25),
      new THREE.MeshStandardMaterial({color: 0xef5350, roughness: 0.45})
    );
  }

  dynamicDefinition(object) {
    return {
      id: 'dynamic-box',
      object,
      position: [2.75, 1.25, 0.5],
      physics: 'dynamic',
      detectObject: true,
      label: 'dynamic box',
      data: {physicsMode: 'dynamic'},
    };
  }

  async resetDynamicBox() {
    xb.core.simulator.objects.removeObjects(['dynamic-box']);
    this.dynamicBox = this.createDynamicBox();
    await xb.core.simulator.objects.addObjects([
      this.dynamicDefinition(this.dynamicBox),
    ]);
    this.tintDetectedMeshes();
    this.clearDetectionMarkers();
  }

  tintDetectedMeshes() {
    for (const detectedMesh of xb.world.meshes.xrMeshToThreeMesh.values()) {
      detectedMesh.material.color?.setHex(0x00e5ff);
    }
  }

  async runDetection() {
    const detections = await xb.world.objects.runDetection();
    this.clearDetectionMarkers();
    for (const detection of detections) {
      this.detectionMarkers.add(this.createDetectionMarker(detection));
    }
  }

  createDetectionMarker(detection) {
    const marker = new THREE.Group();
    marker.position.copy(detection.position);

    const point = new THREE.Mesh(
      new THREE.SphereGeometry(0.055, 16, 12),
      new THREE.MeshBasicMaterial({color: 0xff3dce, depthTest: false})
    );
    point.renderOrder = 1000;
    marker.add(point);

    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const context = canvas.getContext('2d');
    context.fillStyle = '#ff3dce';
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.fillStyle = '#160012';
    context.font = '600 54px system-ui, sans-serif';
    context.textAlign = 'center';
    context.textBaseline = 'middle';
    context.fillText(detection.label, canvas.width / 2, canvas.height / 2);

    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    const label = new THREE.Sprite(
      new THREE.SpriteMaterial({map: texture, depthTest: false})
    );
    label.position.y = 0.13;
    label.scale.set(0.65, 0.16, 1);
    label.renderOrder = 1000;
    label.raycast = () => {};
    marker.add(label);
    return marker;
  }

  clearDetectionMarkers() {
    for (const marker of [...this.detectionMarkers.children]) {
      const point = marker.children[0];
      const label = marker.children[1];
      point.geometry.dispose();
      point.material.dispose();
      label.material.map.dispose();
      label.material.dispose();
      marker.removeFromParent();
    }
  }

  addPlaneLabels() {
    this.clearPlaneLabels();
    xb.world.planes.get().forEach((plane, index) => {
      const center = new THREE.Vector3(0, 0.04, 0);
      const polygon = plane.simulatorPlane?.polygon;
      if (polygon?.length) {
        for (const point of polygon) {
          center.x += point.x;
          center.z += point.y;
        }
        center.x /= polygon.length;
        center.z /= polygon.length;
      } else {
        plane.geometry.computeBoundingBox();
        plane.geometry.boundingBox?.getCenter(center);
        center.y += 0.04;
      }

      const text = `#${index + 1} ${plane.label ?? 'unlabeled'}`;
      const canvas = document.createElement('canvas');
      canvas.width = 512;
      canvas.height = 128;
      const context = canvas.getContext('2d');
      if (!context) return;
      context.fillStyle = '#ffe600';
      context.fillRect(0, 0, canvas.width, canvas.height);
      context.fillStyle = '#171700';
      context.font = '700 48px system-ui, sans-serif';
      context.textAlign = 'center';
      context.textBaseline = 'middle';
      context.fillText(text, canvas.width / 2, canvas.height / 2);

      const texture = new THREE.CanvasTexture(canvas);
      texture.colorSpace = THREE.SRGBColorSpace;
      const label = new THREE.Sprite(
        new THREE.SpriteMaterial({map: texture, depthTest: false})
      );
      label.name = `Plane ${index + 1} Label`;
      label.position.copy(center);
      label.scale.set(0.8, 0.2, 1);
      label.renderOrder = 1000;
      label.raycast = () => {};
      plane.add(label);
      this.planeLabels.push(label);
    });
  }

  clearPlaneLabels() {
    for (const label of this.planeLabels) {
      label.material.map.dispose();
      label.material.dispose();
      label.removeFromParent();
    }
    this.planeLabels.length = 0;
  }
}

const demo = new SimulatorSceneObjectsDemo();
detectButton.addEventListener('click', () => void demo.runDetection());
resetButton.addEventListener('click', () => void demo.resetDynamicBox());
meshesButton.addEventListener('click', () => {
  xb.world.meshes.visible = !xb.world.meshes.visible;
});
planesButton.addEventListener('click', () => {
  xb.world.planes.showDebugVisualizations(!xb.world.planes.visible);
});
navMeshButton.addEventListener('click', () => {
  const navMesh = xb.core.simulator.navMesh;
  navMesh.showDebugVisualizations(!navMesh.debugVisualizationsVisible);
});

const options = new xb.Options();
options.formFactor = 'desktop';
options.setAppTitle('Simulator Scene Objects');
options.physics.RAPIER = RAPIER;
options.enableDepth();
options.world.enableMeshDetection();
options.world.meshes.showDebugVisualizations = true;
options.enablePlaneDetection();
options.world.planes.showDebugVisualizations = true;
options.enableObjectDetection();
options.world.objects.simulatorOverride = true;
options.simulator.handPhysics.enabled = true;
options.simulator.navMesh.showDebugVisualizations = true;
options.simulator.environments.push({
  name: 'Living Room Object Test',
  manifestPath: './scene.json?demo=simulator-scene-objects',
});
options.simulator.activeEnvironmentIndex =
  options.simulator.environments.length - 1;
options.simulator.initialCameraPosition = {x: 0, y: 1.5, z: 3};
options.simulator.defaultMode = xb.SimulatorMode.USER;

xb.add(demo);
await xb.init(options);
