import 'xrblocks/addons/simulator/SimulatorAddons.js';
import * as xb from 'xrblocks';
import * as THREE from 'three';
import {Text} from 'troika-three-text';

class PinchTracker extends xb.Script {
  static dependencies = {camera: THREE.Camera};

  init({camera}) {
    this.camera = camera;
    console.log('PinchTracker initialized');
    this.initHudText();
  }

  initHudText() {
    this.hudText = new Text();
    this.hudText.text = 'Pinch to start';
    this.hudText.fontSize = 0.03;
    this.hudText.color = 0x00ffff;
    this.hudText.maxWidth = 0.5;
    this.hudText.position.set(0, 0, -0.5); // 50cm in front of camera
    this.hudText.textAlign = 'center';
    this.hudText.anchorX = 'center';
    this.hudText.anchorY = 'middle';

    this.add(this.hudText);
    this.hudText.sync();
  }

  update() {
    // Update HUD position to follow camera
    if (this.hudText && this.camera) {
      const position = new THREE.Vector3();
      const quaternion = new THREE.Quaternion();

      this.camera.getWorldPosition(position);
      this.camera.getWorldQuaternion(quaternion);

      // Get forward direction
      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(quaternion);

      // Position text 0.5m in front of camera
      this.hudText.position.copy(position).addScaledVector(forward, 0.5);
      this.hudText.quaternion.copy(quaternion);
    }

    // 0 is usually Left hand, 1 is Right hand
    const leftHandIndex = 0;

    if (xb.user && xb.user.isSelecting(leftHandIndex)) {
      const hands = xb.user.hands;
      if (hands) {
        // Get the index finger tip for the left hand
        const indexTip = hands.getIndexTip(0);

        if (indexTip) {
          const worldPos = new THREE.Vector3();
          indexTip.getWorldPosition(worldPos);

          const coordsStr = `x:${worldPos.x.toFixed(3)}, y:${worldPos.y.toFixed(3)}, z:${worldPos.z.toFixed(3)}`;

          console.log(`Left Pinch Coordinates: ${coordsStr}`);

          this.hudText.text = `Pinching!\n${coordsStr}`;
          this.hudText.sync();
        } else {
          this.hudText.text = 'Pinching, but tip not found';
          this.hudText.sync();
        }
      }
    } else {
      if (this.hudText.text !== 'Pinch to start') {
        this.hudText.text = 'Pinch to start';
        this.hudText.sync();
      }
    }
  }
}

const options = new xb.Options();
options.world.enabled = true;
options.hands.enabled = true;
options.simulator.modeToggle.enabled = true;
options.xrButton.showEnterSimulatorButton = true;

options.setAppTitle('Unistroke Recognizer');
options.setAppDescription('Tracks left hand pinch and logs coordinates.');

function start() {
  const tracker = new PinchTracker();
  xb.add(tracker);
  xb.init(options);
}

document.addEventListener('DOMContentLoaded', function () {
  start();
});
