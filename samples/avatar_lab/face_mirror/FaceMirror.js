import * as xb from 'xrblocks';
import {FaceWireframe} from './FaceWireframe.js';
import {FaceSpatialHud} from './FaceSpatialHud.js';

export class FaceMirror extends xb.Script {
  static dependencies = {
    world: xb.World,
  };

  init({world}) {
    this.world = world;

    this.wireframe = new FaceWireframe();
    this.add(this.wireframe);

    this.spatialHud = new FaceSpatialHud(this);

    if (this.world.faces) {
      this.world.faces.start(this);
    }
  }

  update() {
    if (!this.world.faces) return;
    this.displayFaces(this.world.faces.detectedFaces);
  }

  displayFaces(faces) {
    if (!faces || faces.length === 0) {
      const msg = 'No face detected. Look at the camera.';
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
    this.spatialHud.updateState(status);
    this.wireframe.setVisible(true);
    this.wireframe.updateFace(face);
    this.updateBars(face);
  }

  updateBars(face) {
    this.spatialHud.updateBars(face);
  }

  resetBars() {
    this.spatialHud.resetBars();
  }

  dispose() {
    if (this.world.faces) {
      this.world.faces.stop(this);
    }
    super.dispose();
  }
}
