import * as xb from 'xrblocks';
import * as THREE from 'three';
import {StrokeRenderer} from './StrokeRenderer.js';
import {PerfectShapeRenderer} from './PerfectShapeRenderer.js';

export class UnistrokeTracker extends xb.Script {
  static dependencies = {
    camera: THREE.Camera,
    scene: THREE.Scene,
  };

  /**
   * Initializes the tracker, sets up UI, stroke renderer, and activates the recognizer.
   * @param {Object} context - The initialization context.
   * @param {THREE.Camera} context.camera - The camera for projection.
   * @param {THREE.Scene} context.scene - The scene to add objects to.
   */
  init({camera, scene}) {
    this.camera = camera;
    this.scene = scene;
    console.log('UnistrokeTracker initialized');

    this.initHudText();

    this.strokeRenderer = new StrokeRenderer(this.scene);
    this.shootingShapes = [];

    // Instantiate and add StrokeRecognizer as a script
    this.unistrokeRecognizer = new xb.StrokeRecognizer();
    xb.add(this.unistrokeRecognizer);
    this.unistrokeRecognizer.activate();

    // Attach listeners to StrokeRecognizer
    this.unistrokeRecognizer.addEventListener('unistrokestart', () => {
      this.strokeRenderer.clear();
      this.hudText.text = 'Capturing...';
      this.hudTextScore.text = '';
    });

    this.unistrokeRecognizer.addEventListener('unistrokeupdate', (e) => {
      const pt = e.detail.point;
      this.strokeRenderer.addPoint(pt);
      this.hudTextCoords.text = `Coords: ${pt.x.toFixed(2)}, ${pt.y.toFixed(2)}, ${pt.z.toFixed(2)}`;
    });

    this.unistrokeRecognizer.addEventListener('unistrokeend', (e) => {
      const {result} = e.detail;
      if (result) {
        const {recognizedShape, confidence} = result;
        console.log(
          `Recognized: ${recognizedShape} with confidence ${confidence}`
        );
        this.hudText.text = `Recognized: ${recognizedShape}`;
        this.hudTextScore.text = `Confidence: ${Math.round(confidence * 100)}%`;

        if (recognizedShape !== 'Unknown' && confidence > 0.6) {
          const points = this.strokeRenderer.getPoints();
          if (points.length > 0) {
            this.spawnShootingShape(recognizedShape, points[points.length - 1]);
          }
        }
      }
    });
  }

  /**
   * Initializes the view-fixed HUD display.
   */
  initHudText() {
    const card = new xb.UICard({
      size: {width: 0.5, height: 0.2},
      pointerEvents: 'none',
    });
    card.name = 'HUDCard';
    this.add(card);
    card.add(
      new xb.FollowHead({
        offset: new THREE.Vector3(0, 0.3, -1.0),
        smoothing: 0.1,
      }),
      new xb.FaceCamera({mode: 'spherical', smoothing: 0.1})
    );

    const panel = new xb.UIPanel({
      pointerEvents: 'none',
      style: {
        width: '100%',
        height: '100%',
        flexDirection: 'column',
        padding: 20,
        gap: 10,
        backgroundColor: '#1a1a1acc',
        borderRadius: 20,
        borderWidth: 2,
        borderColor: '#ffffff33',
        justifyContent: 'center',
        alignItems: 'center',
      },
    });

    card.add(panel);

    this.hudText = new xb.UIText({
      text: 'Pinch to start',
      pointerEvents: 'none',
      style: {
        color: '#00ffff',
        fontSize: 24,
        fontWeight: 'bold',
        textAlign: 'center',
      },
    });
    panel.add(this.hudText);

    this.hudTextScore = new xb.UIText({
      text: '',
      pointerEvents: 'none',
      style: {color: '#00ffff', fontSize: 20, textAlign: 'center'},
    });
    panel.add(this.hudTextScore);

    this.hudTextCoords = new xb.UIText({
      text: '',
      pointerEvents: 'none',
      style: {color: '#00ffff', fontSize: 16, textAlign: 'center'},
    });
    panel.add(this.hudTextCoords);
  }

  /**
   * Spawns a shooting shape that travels from the hand position in the direction of the camera view.
   * @param {string} shapeName - The name of the shape to spawn.
   * @param {THREE.Vector3} handPos - The position to spawn the shape at.
   */
  spawnShootingShape(shapeName, handPos) {
    // Calculate direction: from camera to hand position
    const cameraPos = new THREE.Vector3();
    this.camera.getWorldPosition(cameraPos);
    const dir = new THREE.Vector3().subVectors(handPos, cameraPos).normalize();

    const shape = new PerfectShapeRenderer(
      this.scene,
      shapeName,
      handPos,
      dir,
      this.camera.quaternion
    );

    this.shootingShapes.push(shape);
  }

  /**
   * Updates all active shooting shapes, removing dead ones.
   */
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
