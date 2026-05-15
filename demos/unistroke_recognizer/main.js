import 'xrblocks/addons/simulator/SimulatorAddons.js';
import * as xb from 'xrblocks';
import * as THREE from 'three';
import {Text} from 'troika-three-text';

class PinchTracker extends xb.Script {
  static dependencies = {camera: THREE.Camera, scene: THREE.Scene};

  init({camera, scene}) {
    this.camera = camera;
    this.scene = scene;
    console.log('PinchTracker initialized');

    this.initHudText();
    this.initDrawing();

    this.isPinching = false;
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

  initDrawing() {
    this.maxPoints = 1000;
    this.points = [];

    this.lineGeometry = new THREE.BufferGeometry();
    this.linePositions = new Float32Array(this.maxPoints * 3);
    this.lineGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.linePositions, 3)
    );

    this.lineMaterial = new THREE.LineBasicMaterial({
      color: 0xff0000,
      linewidth: 1,
      depthTest: false, // Render on top of everything
    });

    this.line = new THREE.Line(this.lineGeometry, this.lineMaterial);
    this.line.renderOrder = 999; // Render last

    // Add directly to scene to avoid local transform issues
    this.scene.add(this.line);

    this.lineGeometry.setDrawRange(0, 0);
  }

  clearLine() {
    this.points = [];
    this.lineGeometry.setDrawRange(0, 0);
  }

  addPointToLine(pos) {
    if (this.points.length < this.maxPoints) {
      this.points.push(pos.clone());
      const index = this.points.length - 1;
      this.linePositions[index * 3] = pos.x;
      this.linePositions[index * 3 + 1] = pos.y;
      this.linePositions[index * 3 + 2] = pos.z;

      this.lineGeometry.attributes.position.needsUpdate = true;
      this.lineGeometry.setDrawRange(0, this.points.length);

      // Update bounding sphere for frustum culling
      this.lineGeometry.computeBoundingSphere();
    }
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

          // Handle line drawing
          if (!this.isPinching) {
            this.isPinching = true;
            this.clearLine();
          }
          this.addPointToLine(worldPos);
        } else {
          this.hudText.text = 'Pinching, but tip not found';
          this.hudText.sync();
        }
      }
    } else {
      this.isPinching = false;

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
