import 'xrblocks/addons/simulator/SimulatorAddons.js';
import * as xb from 'xrblocks';
import * as THREE from 'three';
import {Text} from 'troika-three-text';

// Recognizer implementation moved to core.

// --- Helper for Perfect Shapes ---

function getPerfectShapeGeometry(name) {
  const geom = new THREE.BufferGeometry();
  let points = [];
  const size = 0.05; // 5cm radius

  switch (name) {
    case 'Circle':
      for (let i = 0; i <= 32; i++) {
        const angle = (i / 32) * Math.PI * 2;
        points.push(
          new THREE.Vector3(Math.cos(angle) * size, Math.sin(angle) * size, 0)
        );
      }
      break;
    case 'Rectangle':
      points = [
        new THREE.Vector3(-size * 1.5, -size, 0),
        new THREE.Vector3(-size * 1.5, size, 0),
        new THREE.Vector3(size * 1.5, size, 0),
        new THREE.Vector3(size * 1.5, -size, 0),
        new THREE.Vector3(-size * 1.5, -size, 0),
      ];
      break;
    case 'Triangle':
      points = [
        new THREE.Vector3(0, size, 0),
        new THREE.Vector3(-size, -size, 0),
        new THREE.Vector3(size, -size, 0),
        new THREE.Vector3(0, size, 0),
      ];
      break;
    case 'V':
      points = [
        new THREE.Vector3(-size, size, 0),
        new THREE.Vector3(0, -size, 0),
        new THREE.Vector3(size, size, 0),
      ];
      break;
    case 'Caret':
      points = [
        new THREE.Vector3(-size, -size, 0),
        new THREE.Vector3(0, size, 0),
        new THREE.Vector3(size, -size, 0),
      ];
      break;
    default:
      return null;
  }

  geom.setFromPoints(points);
  return geom;
}

function getPerfectShapeFillGeometry(name) {
  const size = 0.05;
  const shape = new THREE.Shape();

  switch (name) {
    case 'Circle':
      shape.absarc(0, 0, size, 0, Math.PI * 2, false);
      break;
    case 'Rectangle':
      shape.moveTo(-size * 1.5, -size);
      shape.lineTo(-size * 1.5, size);
      shape.lineTo(size * 1.5, size);
      shape.lineTo(size * 1.5, -size);
      shape.lineTo(-size * 1.5, -size);
      break;
    case 'Triangle':
      shape.moveTo(0, size);
      shape.lineTo(-size, -size);
      shape.lineTo(size, -size);
      shape.lineTo(0, size);
      break;
    case 'V':
      shape.moveTo(-size, size);
      shape.lineTo(0, -size);
      shape.lineTo(size, size);
      shape.closePath();
      break;
    case 'Caret':
      shape.moveTo(-size, -size);
      shape.lineTo(0, size);
      shape.lineTo(size, -size);
      shape.closePath();
      break;
    default:
      return null;
  }

  return new THREE.ShapeGeometry(shape);
}

// --- PinchTracker Script ---

class PinchTracker extends xb.Script {
  static dependencies = {camera: THREE.Camera, scene: THREE.Scene};

  init({camera, scene}) {
    this.camera = camera;
    this.scene = scene;
    console.log('PinchTracker initialized');

    this.initHudText();
    this.initDrawing();

    this.shootingLines = [];
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
    this.lineGeometry = new THREE.BufferGeometry();
    this.maxPoints = 1000;
    this.linePositions = new Float32Array(this.maxPoints * 3);
    this.lineGeometry.setAttribute(
      'position',
      new THREE.BufferAttribute(this.linePositions, 3)
    );

    this.lineMaterial = new THREE.LineBasicMaterial({
      color: 0xaa0000,
      linewidth: 5,
      depthTest: false,
      transparent: true,
      opacity: 1,
    });

    this.line = new THREE.Line(this.lineGeometry, this.lineMaterial);
    this.line.renderOrder = 999;
    this.lineGeometry.setDrawRange(0, 0);

    this.scene.add(this.line);

    this.capturedPointsCount = 0;
  }

  spawnShootingShape(shapeName, points) {
    const geom = getPerfectShapeGeometry(shapeName);
    if (!geom) return;

    const mat = new THREE.LineBasicMaterial({
      color: 0x00ff00,
      linewidth: 5,
      depthTest: false,
      transparent: true,
      opacity: 1,
    });

    const shootLine = new THREE.Line(geom, mat);
    shootLine.renderOrder = 999;

    const fillGeom = getPerfectShapeFillGeometry(shapeName);
    if (fillGeom) {
      const fillMat = new THREE.MeshBasicMaterial({
        color: 0x00ff00,
        transparent: true,
        opacity: 0.3,
        depthTest: false,
        side: THREE.DoubleSide,
      });
      const fillMesh = new THREE.Mesh(fillGeom, fillMat);
      fillMesh.renderOrder = 998;
      shootLine.add(fillMesh);
    }

    // Position at the last filtered point
    const handPos = points[points.length - 1];
    shootLine.position.copy(handPos);

    // Rotate to face the camera
    shootLine.quaternion.copy(this.camera.quaternion);

    this.scene.add(shootLine);

    // Calculate direction: from camera to hand position
    const cameraPos = new THREE.Vector3();
    this.camera.getWorldPosition(cameraPos);
    const dir = new THREE.Vector3().subVectors(handPos, cameraPos).normalize();

    this.shootingLines.push({
      line: shootLine,
      dir: dir,
      age: 0,
      maxAge: 2.0,
    });
  }

  update() {
    // Update HUD position to follow camera
    if (this.hudText && this.camera) {
      const position = new THREE.Vector3();
      const quaternion = new THREE.Quaternion();

      this.camera.getWorldPosition(position);
      this.camera.getWorldQuaternion(quaternion);

      const forward = new THREE.Vector3(0, 0, -1).applyQuaternion(quaternion);
      this.hudText.position.copy(position).addScaledVector(forward, 0.5);
      this.hudText.quaternion.copy(quaternion);
    }

    // Update shooting lines
    const delta = xb.getDeltaTime ? xb.getDeltaTime() : 0.016;
    const speed = 2.0;

    for (let i = this.shootingLines.length - 1; i >= 0; i--) {
      const item = this.shootingLines[i];
      item.line.position.addScaledVector(item.dir, speed * delta);
      item.age += delta;

      const opacity = 1 - item.age / item.maxAge;
      item.line.material.opacity = opacity;

      if (item.line.children.length > 0) {
        item.line.children[0].material.opacity = 0.3 * opacity;
      }

      if (item.age >= item.maxAge) {
        this.scene.remove(item.line);
        item.line.geometry.dispose();
        item.line.material.dispose();

        if (item.line.children.length > 0) {
          const child = item.line.children[0];
          child.geometry.dispose();
          child.material.dispose();
        }

        this.shootingLines.splice(i, 1);
      }
    }

    const leftHandIndex = 0;
    const currentTime = Date.now() / 1000; // Use seconds

    if (xb.user && xb.user.hands) {
      const hands = xb.user.hands;

      if (!hands.unistrokeRecognizer) {
        hands.enableUnistrokeRecognizer(this.scene, this.camera);
        hands.unistrokeRecognizer.activate();

        hands.unistrokeRecognizer.addEventListener('unistroke_started', (e) => {
          this.capturedPointsCount = 0;
          this.lineGeometry.setDrawRange(0, 0);
        });

        hands.unistrokeRecognizer.addEventListener('unistroke_updated', (e) => {
          const pos = e.point;
          if (this.capturedPointsCount < this.maxPoints) {
            const index = this.capturedPointsCount;
            this.linePositions[index * 3] = pos.x;
            this.linePositions[index * 3 + 1] = pos.y;
            this.linePositions[index * 3 + 2] = pos.z;

            this.lineGeometry.attributes.position.needsUpdate = true;
            this.capturedPointsCount++;
            this.lineGeometry.setDrawRange(0, this.capturedPointsCount);
            this.lineGeometry.computeBoundingSphere();
          }
        });

        hands.unistrokeRecognizer.addEventListener('unistroke_ended', (e) => {
          const result = e.result;
          if (result) {
            console.log(
              `Recognized: ${result.name} with score ${result.score}`
            );
            this.hudText.text = `Recognized: ${result.name}\nScore: ${Math.round(result.score * 100)}%`;
            this.hudText.sync();

            if (result.name !== 'Unknown' && result.score > 0.6) {
              this.spawnShootingShape(result.name, result.points3D);
            }
          }
        });
      }

      const isPinching = xb.user.isSelecting(leftHandIndex);
      const indexTip = hands.getIndexTip(0);

      if (indexTip) {
        const worldPos = new THREE.Vector3();
        indexTip.getWorldPosition(worldPos);

        hands.unistrokeRecognizer.update(currentTime, isPinching, worldPos);
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
options.setAppDescription(
  'Tracks left hand pinch, recognizes shapes accurately, and shoots them out.'
);

function start() {
  const tracker = new PinchTracker();
  xb.add(tracker);
  xb.init(options);
}

document.addEventListener('DOMContentLoaded', function () {
  start();
});
