import * as THREE from 'three';
import * as xb from 'xrblocks';

export class HandsInteraction extends xb.Script {
  init() {
    // Touch state.
    this.leftHandTouching = false;
    this.rightHandTouching = false;

    // Grab state.
    this.isGrabbing = false;
    this._handToObject = null;

    // Add a cylinder to touch and grab.
    this.originalColor = new THREE.Color(0xFBBC05);
    const geometry =
        new THREE.CylinderGeometry(0.1, 0.1, 0.2, 32).translate(0, 1.45, -0.4);
    const material = new THREE.MeshPhongMaterial({color: this.originalColor});
    this.target = new THREE.Mesh(geometry, material);
    this.add(this.target);

    // Add a light.
    this.add(new THREE.HemisphereLight(0xbbbbbb, 0x888888, 3));
    const light = new THREE.DirectionalLight(0xffffff, 2);
    light.position.set(1, 1, 1).normalize();
    this.add(light);
  }

  _updateColor() {
    if (this.leftHandTouching && this.rightHandTouching) {
      this.target.material.color.setHex(0xDB4437);  // Red
    } else if (this.leftHandTouching) {
      this.target.material.color.setHex(0x34A853);  // Green
    } else if (this.rightHandTouching) {
      this.target.material.color.setHex(0x4285F4);  // Blue
    } else {
      this.target.material.color.copy(this.originalColor);  // Yellow
    }
  }

  onObjectTouchStart(event) {
    const handName = event.handIndex === xb.Handedness.LEFT ? 'left' : 'right';
    console.log(`Touch started with ${handName} hand!`);

    if (event.handIndex === xb.Handedness.LEFT) {
      this.leftHandTouching = true;
    } else if (event.handIndex === xb.Handedness.RIGHT) {
      this.rightHandTouching = true;
    }
    this._updateColor();
  }

  onObjectTouchEnd(event) {
    const handName = event.handIndex === xb.Handedness.LEFT ? 'left' : 'right';
    console.log(`Touch ended with ${handName} hand!`);

    if (event.handIndex === xb.Handedness.LEFT) {
      this.leftHandTouching = false;
    } else if (event.handIndex === xb.Handedness.RIGHT) {
      this.rightHandTouching = false;
    }
    this._updateColor();
  }

  onObjectGrabStart(event) {
    if (this.isGrabbing) return;
    this.isGrabbing = true;

    const handName = event.handIndex === xb.Handedness.LEFT ? 'left' : 'right';
    console.log(`Grab started with ${handName} hand!`);

    // Make sure matrices are fresh.
    this.target.updateMatrixWorld(true);
    event.hand.updateMatrixWorld(true);

    // Save the initial hand to object delta transform.
    const H0 = new THREE.Matrix4().copy(event.hand.matrixWorld);
    const O0 = new THREE.Matrix4().copy(this.target.matrixWorld);
    this._handToObject = new THREE.Matrix4().copy(H0).invert().multiply(O0);
  }

  onObjectGrabbing(event) {
    if (!this.isGrabbing || !this._handToObject) return;

    event.hand.updateMatrixWorld(true);
    const H = new THREE.Matrix4().copy(event.hand.matrixWorld);
    const O = new THREE.Matrix4().multiplyMatrices(H, this._handToObject);
    const parent = this.target.parent;
    if (parent) parent.updateMatrixWorld(true);
    const parentInv = parent ?
        new THREE.Matrix4().copy(parent.matrixWorld).invert() :
        new THREE.Matrix4().identity();

    const Olocal = new THREE.Matrix4().multiplyMatrices(parentInv, O);
    const pos = new THREE.Vector3();
    const quat = new THREE.Quaternion();
    const scl = new THREE.Vector3();
    Olocal.decompose(pos, quat, scl);

    this.target.position.copy(pos);
    this.target.quaternion.copy(quat);

    this.target.updateMatrix();
  }

  onObjectGrabEnd(event) {
    if (!this.isGrabbing) return;
    const handName = event.handIndex === xb.Handedness.LEFT ? 'left' : 'right';
    console.log(`Grab ended with ${handName} hand!`);

    this.isGrabbing = false;
    this._handToObject = null;
  }
}
