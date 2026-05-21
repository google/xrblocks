import * as THREE from 'three';

export class StrokeRenderer {
  constructor(scene, maxPoints = 1000) {
    this.scene = scene;
    this.maxPoints = maxPoints;
    this.capturedPointsCount = 0;
    this.linePositions = new Float32Array(this.maxPoints * 3);
    this.trackedPoints = [];

    this.init();
  }

  init() {
    this.lineGeometry = new THREE.BufferGeometry();
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
  }

  addPoint(pos) {
    if (this.capturedPointsCount < this.maxPoints) {
      const index = this.capturedPointsCount;
      this.linePositions[index * 3] = pos.x;
      this.linePositions[index * 3 + 1] = pos.y;
      this.linePositions[index * 3 + 2] = pos.z;

      this.lineGeometry.attributes.position.needsUpdate = true;
      this.capturedPointsCount++;
      this.lineGeometry.setDrawRange(0, this.capturedPointsCount);
      this.lineGeometry.computeBoundingSphere();

      this.trackedPoints.push(pos.clone());
    }
  }

  clear() {
    this.capturedPointsCount = 0;
    this.lineGeometry.setDrawRange(0, 0);
    this.trackedPoints = [];
  }

  getPoints() {
    return this.trackedPoints;
  }
}
