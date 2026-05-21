import * as THREE from 'three';
import {PerfectShapeFactory} from './PerfectShapeFactory.js';

export class ShootingShape {
  constructor(scene, shapeName, position, direction, cameraQuaternion) {
    this.scene = scene;
    this.shapeName = shapeName;
    this.position = position;
    this.direction = direction;
    this.cameraQuaternion = cameraQuaternion;

    this.age = 0;
    this.maxAge = 2.0;
    this.speed = 2.0;

    this.init();
  }

  init() {
    const geom = PerfectShapeFactory.getGeometry(this.shapeName);
    if (!geom) return;

    this.material = new THREE.LineBasicMaterial({
      color: 0x00ff00,
      linewidth: 5,
      depthTest: false,
      transparent: true,
      opacity: 1,
    });

    this.line = new THREE.Line(geom, this.material);
    this.line.renderOrder = 999;

    const fillGeom = PerfectShapeFactory.getFillGeometry(this.shapeName);
    if (fillGeom) {
      this.fillMaterial = new THREE.MeshBasicMaterial({
        color: 0x00ff00,
        transparent: true,
        opacity: 0.3,
        depthTest: false,
        side: THREE.DoubleSide,
      });
      const fillMesh = new THREE.Mesh(fillGeom, this.fillMaterial);
      fillMesh.renderOrder = 998;
      this.line.add(fillMesh);
    }

    this.line.position.copy(this.position);
    this.line.quaternion.copy(this.cameraQuaternion);

    this.scene.add(this.line);
  }

  update(delta) {
    if (!this.line) return false;

    this.line.position.addScaledVector(this.direction, this.speed * delta);
    this.age += delta;

    const opacity = 1 - this.age / this.maxAge;
    this.material.opacity = opacity;

    if (this.line.children.length > 0) {
      this.fillMaterial.opacity = 0.3 * opacity;
    }

    if (this.age >= this.maxAge) {
      this.dispose();
      return false; // Dead
    }
    return true; // Alive
  }

  dispose() {
    if (!this.line) return;

    this.scene.remove(this.line);
    this.line.geometry.dispose();
    this.material.dispose();

    if (this.line.children.length > 0) {
      const child = this.line.children[0];
      child.geometry.dispose();
      this.fillMaterial.dispose();
    }

    this.line = null;
  }
}
