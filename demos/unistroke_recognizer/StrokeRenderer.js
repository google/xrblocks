import * as THREE from 'three';

/**
 * Handles rendering the raw stroke path drawn by the user in 3D space.
 * Uses a dynamic BufferGeometry for efficient line updates.
 */
export class StrokeRenderer {
  /**
   * @param {THREE.Scene} scene - The scene to add the line to.
   * @param {number} [maxPoints=1000] - Maximum number of points in the stroke.
   */
  constructor(scene, maxPoints = 1000) {
    this.scene = scene;
    this.maxPoints = maxPoints;
    this.capturedPointsCount = 0;
    this.linePositions = new Float32Array(this.maxPoints * 3);
    this.trackedPoints = [];

    this.init();
  }

  /**
   * Initializes the line geometry and material, and adds the line to the scene.
   */
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

  /**
   * Adds a point to the stroke path and updates the geometry.
   * @param {THREE.Vector3} pos - The world position of the point to add.
   */
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

  /**
   * Clears the stroke path.
   */
  clear() {
    this.capturedPointsCount = 0;
    this.lineGeometry.setDrawRange(0, 0);
    this.trackedPoints = [];
  }

  /**
   * Returns the array of tracked points.
   * @returns {THREE.Vector3[]} Array of captured points.
   */
  getPoints() {
    return this.trackedPoints;
  }
}
