import * as THREE from 'three';
import * as xb from 'xrblocks';

export class GestureInspector extends xb.Script {
  init() {
    this.add(new THREE.HemisphereLight(0xffffff, 0x1b243d, 2));
    this.feedback = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.16, 2),
      new THREE.MeshStandardMaterial({color: 0x7a8cff})
    );
    this.feedback.position.set(0, 1.4, -1.15);
    this.add(this.feedback);

    this.gestures = xb.core.gestureRecognition;
    this.onStart = (event) => this.showGesture(event.detail);
    this.onEnd = () => this.clearGesture();
    this.gestures.addEventListener('gesturestart', this.onStart);
    this.gestures.addEventListener('gestureend', this.onEnd);
  }

  showGesture(gesture) {
    console.log(gesture.name, gesture.hand, gesture.confidence);
    this.feedback.material.color.set(
      gesture.hand === 'left' ? 0xffa24a : 0x50cf8a
    );
  }

  clearGesture() {
    this.feedback.material.color.set(0x7a8cff);
    this.feedback.scale.setScalar(1);
  }

  dispose() {
    this.gestures.removeEventListener('gesturestart', this.onStart);
    this.gestures.removeEventListener('gestureend', this.onEnd);
    this.feedback.geometry.dispose();
    this.feedback.material.dispose();
  }
}
