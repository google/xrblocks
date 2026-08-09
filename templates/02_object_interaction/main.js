import * as THREE from 'three';
import * as xb from 'xrblocks';

class ObjectInteraction extends xb.MeshScript {
  constructor() {
    super(
      new THREE.BoxGeometry(0.22, 0.22, 0.22),
      new THREE.MeshStandardMaterial({color: 0xfbbc04})
    );
    this.name = 'Interactive cube';
    this.position.set(0, 1.35, -0.65);
    this.xb = {manipulation: true};
  }

  init() {
    this.add(new THREE.HemisphereLight(0xffffff, 0x3c4043, 3));
  }

  onObjectSelectStart(event) {
    if (event.source.type !== 'direct-touch') {
      this.material.color.set(0x4285f4);
    }
    event.stopPropagation();
  }

  onObjectSelectEnd(event) {
    if (event.source.type !== 'direct-touch') {
      this.material.color.set(0xfbbc04);
    }
    event.stopPropagation();
  }

  onObjectTouchStart(event) {
    // Keep the default selection enabled because automatic manipulation uses
    // that capture when grab starts. Prevent it only for touch-only objects.
    this.material.color.set(0x34a853);
    event.stopPropagation();
  }

  onObjectTouchEnd(event) {
    this.material.color.set(0xfbbc04);
    event.stopPropagation();
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}

const options = new xb.Options();
options.enableHands();
options.hands.visualization = true;
options.simulator.defaultMode = xb.SimulatorMode.CONTROLLER;

xb.add(new ObjectInteraction());
xb.init(options);
