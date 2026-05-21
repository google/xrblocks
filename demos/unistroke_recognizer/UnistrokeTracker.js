import * as xb from 'xrblocks';
import * as THREE from 'three';
import {UICore, UIText, UIPanel, HeadLeashBehavior} from 'uiblocks';
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

    this.uiCore = new UICore(this);
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
      this.hudText.setText('Capturing...');
      this.hudTextScore.setText('');
    });

    this.unistrokeRecognizer.addEventListener('unistrokeupdate', (e) => {
      const pt = e.detail.point;
      this.strokeRenderer.addPoint(pt);
      this.hudTextCoords.setText(
        `Coords: ${pt.x.toFixed(2)}, ${pt.y.toFixed(2)}, ${pt.z.toFixed(2)}`
      );
    });

    this.unistrokeRecognizer.addEventListener('unistrokeend', (e) => {
      const {result} = e.detail;
      if (result) {
        const {recognizedShape, confidence} = result;
        console.log(
          `Recognized: ${recognizedShape} with confidence ${confidence}`
        );
        this.hudText.setText(`Recognized: ${recognizedShape}`);
        this.hudTextScore.setText(
          `Confidence: ${Math.round(confidence * 100)}%`
        );

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
    const card = this.uiCore.createCard({
      name: 'HUDCard',
      sizeX: 0.5,
      sizeY: 0.2,
      position: new THREE.Vector3(0, 0.3, -1.0),
      behaviors: [
        new HeadLeashBehavior({
          offset: new THREE.Vector3(0, 0.3, -1.0),
          posLerp: 0.1,
          rotLerp: 0.1,
        }),
      ],
    });

    const panel = new UIPanel({
      flexDirection: 'column',
      padding: 20,
      gap: 10,
      fillColor: '#1a1a1acc', // Semi-transparent dark bg
      cornerRadius: 20,
      strokeWidth: 2,
      strokeColor: '#ffffff33',
      justifyContent: 'center',
      alignItems: 'center',
      width: '100%',
      height: '100%',
    });
    card.add(panel);

    this.hudText = new UIText('Pinch to start', {
      color: '#00ffff',
      fontSize: 24,
      fontWeight: 'bold',
      textAlign: 'center',
    });
    panel.add(this.hudText);

    this.hudTextScore = new UIText('', {
      color: '#00ffff',
      fontSize: 20,
      textAlign: 'center',
    });
    panel.add(this.hudTextScore);

    this.hudTextCoords = new UIText('', {
      color: '#00ffff',
      fontSize: 16,
      textAlign: 'center',
    });
    panel.add(this.hudTextCoords);
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
