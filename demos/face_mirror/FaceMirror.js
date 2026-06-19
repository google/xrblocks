import * as xb from 'xrblocks';
import {UICore} from 'uiblocks';
import {FEATURED_BLENDSHAPES} from './FaceMeshIndices.js';
import {FaceWireframe} from './FaceWireframe.js';
import {FaceSpatialHud} from './FaceSpatialHud.js';
import './FaceMirrorStatus.js';

export class FaceMirror extends xb.Script {
  static dependencies = {
    world: xb.World,
  };

  init({world}) {
    this.world = world;
    this.uiCore = new UICore(this);
    this.detecting = false;
    this.framesSinceLastDetect = 0;
    this.detectEveryNFrames = 2;

    this.wireframe = new FaceWireframe();
    this.add(this.wireframe);

    this.statusEl = document.querySelector('face-mirror-status');
    this.statusEl.blendshapes = FEATURED_BLENDSHAPES;

    this.spatialHud = new FaceSpatialHud(this.uiCore);
  }

  async update() {
    this.framesSinceLastDetect++;
    if (!this.world.faces || this.detecting) return;
    if (this.framesSinceLastDetect < this.detectEveryNFrames) return;

    this.framesSinceLastDetect = 0;
    this.detecting = true;
    try {
      const faces = await this.world.faces.runDetection();
      this.displayFaces(faces);
    } catch (err) {
      const msg = 'Detection error: ' + (err.message || String(err));
      this.statusEl.updateState(msg);
      this.spatialHud.updateState(msg);
      console.error('Face detection failed:', err);
    } finally {
      this.detecting = false;
    }
  }

  displayFaces(faces) {
    if (!faces || faces.length === 0) {
      const msg = 'No face detected. Look at the camera.';
      this.statusEl.updateState(msg);
      this.spatialHud.updateState(msg);
      this.wireframe.setVisible(false);
      this.resetBars();
      return;
    }
    const face = faces[0];
    const status =
      `${face.landmarks.length} landmarks tracked` +
      (face.blendshapes.length
        ? ` | ${face.blendshapes.length} blendshapes`
        : '');
    this.statusEl.updateState(status);
    this.spatialHud.updateState(status);
    this.wireframe.setVisible(true);
    this.wireframe.updateFace(face);
    this.updateBars(face);
  }

  updateBars(face) {
    this.statusEl.updateBars(face);
    this.spatialHud.updateBars(face);
  }

  resetBars() {
    this.statusEl.resetBars();
    this.spatialHud.resetBars();
  }
}
