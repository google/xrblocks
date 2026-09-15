import * as THREE from 'three';
import * as xb from 'xrblocks';

// Scene Mesh demo.
//
// This uses the same approach as plane detection: the app only enables the
// feature, and the SDK supplies the data. On a real Android XR device the
// MeshDetector reads `frame.detectedMeshes`; in the desktop simulator,
// SimulatorWorld extracts the ground-truth geometry of the loaded environment
// GLTF and injects it via MeshDetector.setSimulatorMeshes(). Either way the
// generated mesh lives at `xb.core.world.meshes`.
//
// It mirrors the depthmesh sample's capabilities: a hemisphere light and a
// spatial opacity slider driven by pinch/click and drag.
class SceneMeshVisualizer extends xb.Script {
  opacity = 1.0;

  constructor() {
    super();
    const light = new THREE.HemisphereLight(0xffffff, 0xbbbbff, 3);
    light.position.set(0.5, 1, 0.25);
    this.add(light);
  }

  init() {
    const card = new xb.UICard({
      size: {width: 0.72, height: 0.22},
      style: {backgroundColor: 'rgba(26, 26, 42, 0.87)'},
    });
    card.position.set(0, xb.user.height + 0.15, -1.25);
    const panel = new xb.UIPanel({
      style: {
        width: '100%',
        height: '100%',
        padding: 24,
        flexDirection: 'column',
        gap: 12,
      },
    });
    panel.add(
      new xb.UIText({
        text: 'Scene mesh opacity',
        style: {color: '#ffffff', fontSize: 32},
      })
    );
    panel.add(
      new xb.UISlider({
        ariaLabel: 'Scene mesh opacity',
        value: this.opacity,
        onInput: (value) => (this.opacity = value),
        style: {width: '100%', height: 28},
      })
    );
    card.add(panel);
    this.add(card);
  }

  // Applies the current opacity to every detected scene mesh material. The
  // MeshDetector's debug materials are shared across meshes, so this is cheap
  // and stays correct as meshes stream in (real device) or are injected once
  // (simulator).
  setSceneMeshOpacity(opacity) {
    const meshes = xb.core?.world?.meshes;
    if (!meshes) return;
    meshes.traverse((object) => {
      if (!object.isMesh || !object.material) return;
      const materials = Array.isArray(object.material)
        ? object.material
        : [object.material];
      for (const material of materials) {
        material.transparent = true;
        material.opacity = opacity;
      }
    });
  }

  update() {
    this.setSceneMeshOpacity(this.opacity);
  }
}

document.addEventListener('DOMContentLoaded', function () {
  const options = new xb.Options();
  options.setAppTitle('Scene Mesh');
  options.world.enableMeshDetection();
  options.world.meshes.showDebugVisualizations = true;
  xb.add(new SceneMeshVisualizer());
  xb.init(options);
});
