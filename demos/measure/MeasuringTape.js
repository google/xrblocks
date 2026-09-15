import * as THREE from 'three';
import {FontLoader} from 'three/addons/loaders/FontLoader.js';

const fontLoader = new FontLoader();
const DEFAULT_FONT_PATH =
  'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r180/examples/fonts/droid/droid_sans_regular.typeface.json';
const upVector = new THREE.Vector3(0.0, 1.0, 0.0);
const backwardsVector = new THREE.Vector3(0.0, 0.0, 1.0);

export class MeasuringTape extends THREE.Object3D {
  xb = {pointerEvents: 'none'};

  constructor(
    firstPoint,
    secondPoint,
    radius = 0.05,
    visualColor = 0xffffff,
    textColor = 0xff0000,
    fontPath = DEFAULT_FONT_PATH
  ) {
    super();
    this.firstPoint = firstPoint.clone();
    this.secondPoint = secondPoint.clone();
    this.radius = radius;

    this.cylinder = new THREE.Mesh(
      new THREE.CylinderGeometry(radius, radius),
      new THREE.MeshStandardMaterial({
        color: visualColor,
        side: THREE.FrontSide,
      })
    );
    this.visual = new THREE.Object3D();
    this.visual.add(this.cylinder);
    this.add(this.visual);
    this.updateVisual();

    this.textGeometry = null;
    this.textMaterial = new THREE.MeshBasicMaterial({
      color: textColor,
      side: THREE.DoubleSide,
    });
    this.textMesh = null;
    this.camera = null;
    fontLoader.load(fontPath, (font) => {
      this.textFont = font;
      this.updateText();
    });
  }

  getLengthText() {
    const length = this.secondPoint.distanceTo(this.firstPoint);
    return `${length.toFixed(2)} m`;
  }

  updateText() {
    if (!this.textFont) {
      // Font is not loaded.
      return;
    }
    if (this.textGeometry) {
      this.textGeometry.dispose();
    }
    const textShapes = this.textFont.generateShapes(this.getLengthText());
    this.textGeometry = new THREE.ShapeGeometry(textShapes);
    this.textGeometry.computeBoundingBox();
    const tempVector = new THREE.Vector3();
    this.textGeometry.boundingBox.getCenter(tempVector);
    this.textGeometry.translate(-tempVector.x, -tempVector.y, -tempVector.z);
    if (this.textMesh) {
      this.remove(this.textMesh);
    }
    this.textMesh = new THREE.Mesh(this.textGeometry, this.textMaterial);
    this.textMesh.position
      .copy(this.firstPoint)
      .add(this.secondPoint)
      .multiplyScalar(0.5);
    const offset = new THREE.Vector3(
      0.0,
      0.0,
      0.1 + 1.5 * this.radius
    ).applyQuaternion(this.cylinder.quaternion);
    this.textMesh.position.add(offset);
    this.textMesh.scale.setScalar(0.0005);
    this.add(this.textMesh);
  }

  setSecondPoint(point) {
    this.secondPoint.copy(point);
    this.updateVisual();
    this.updateText();
  }

  rotateTextToFaceCamera(cameraPosition) {
    if (this.textMesh) {
      this.textMesh.quaternion.setFromUnitVectors(
        backwardsVector,
        cameraPosition.clone().sub(this.textMesh.position).normalize()
      );
    }
  }

  updateVisual() {
    const tempVector = this.cylinder.position;
    this.cylinder.quaternion.setFromUnitVectors(
      upVector,
      tempVector.copy(this.secondPoint).sub(this.firstPoint).normalize()
    );
    this.cylinder.scale.set(
      1.0,
      tempVector.subVectors(this.secondPoint, this.firstPoint).length(),
      1.0
    );
    this.cylinder.position
      .copy(this.firstPoint)
      .add(this.secondPoint)
      .multiplyScalar(0.5);
  }
}
