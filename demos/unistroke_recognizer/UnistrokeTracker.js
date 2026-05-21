import * as xb from 'xrblocks';
import * as THREE from 'three';
import {Text} from 'troika-three-text';
import {StrokeRenderer} from './StrokeRenderer.js';
import {ShootingShape} from './ShootingShape.js';

export class UnistrokeTracker extends xb.Script {
  static dependencies = {
    camera: THREE.Camera,
    scene: THREE.Scene,
    gestureRecognition: xb.GestureRecognition,
  };

  init({camera, scene, gestureRecognition}) {
    this.camera = camera;
    this.scene = scene;
    this.gestureRecognition = gestureRecognition;
    console.log('UnistrokeTracker initialized');

    this.initHudText();

    this.strokeRenderer = new StrokeRenderer(this.scene);
    this.shootingShapes = [];

    // Instantiate and add StrokeRecognizer as a script
    this.unistrokeRecognizer = new xb.StrokeRecognizer();
    xb.add(this.unistrokeRecognizer);
    this.unistrokeRecognizer.activate();

    // Attach listeners to StrokeRecognizer
    this.unistrokeRecognizer.addEventListener('unistrokestart', (e) => {
      this.strokeRenderer.clear();
    });

    this.unistrokeRecognizer.addEventListener('unistrokeupdate', (e) => {
      this.strokeRenderer.addPoint(e.detail.point);
    });

    this.unistrokeRecognizer.addEventListener('unistrokeend', (e) => {
      const {result} = e.detail;
      if (result) {
        const {recognizedShape, confidence} = result;
        console.log(
          `Recognized: ${recognizedShape} with confidence ${confidence}`
        );
        this.hudText.text = `Recognized: ${recognizedShape}\nScore: ${Math.round(confidence * 100)}%`;
        this.hudText.sync();

        if (recognizedShape !== 'Unknown' && confidence > 0.6) {
          const points = this.strokeRenderer.getPoints();
          if (points.length > 0) {
            this.spawnShootingShape(recognizedShape, points[points.length - 1]);
          }
        }
      }
    });
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

    this.scene.add(this.hudText);
    this.hudText.sync();
  }

  spawnShootingShape(shapeName, handPos) {
    // Calculate direction: from camera to hand position
    const cameraPos = new THREE.Vector3();
    this.camera.getWorldPosition(cameraPos);
    const dir = new THREE.Vector3().subVectors(handPos, cameraPos).normalize();

    const shape = new ShootingShape(
      this.scene,
      shapeName,
      handPos,
      dir,
      this.camera.quaternion
    );

    this.shootingShapes.push(shape);
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

    // Update shooting shapes
    const delta = xb.getDeltaTime ? xb.getDeltaTime() : 0.016;

    for (let i = this.shootingShapes.length - 1; i >= 0; i--) {
      const shape = this.shootingShapes[i];
      const alive = shape.update(delta);
      if (!alive) {
        this.shootingShapes.splice(i, 1);
      }
    }
  }
}
