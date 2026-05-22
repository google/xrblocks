import * as THREE from 'three';

/**
 * Renders a "perfect shape" (e.g., Circle, Rectangle) that shoots out from the user's hand
 * after a gesture is recognized. Handles both outline and fill geometries, and fades out over time.
 */
export class PerfectShapeRenderer {
  // Caches geometries to avoid recreation and GPU upload overhead.
  static geometryCache = new Map();

  /**
   * @param {THREE.Scene} scene - The scene to add the shape to.
   * @param {string} shapeName - The name of the shape to render (e.g., 'Circle', 'Rectangle').
   * @param {THREE.Vector3} position - The initial position of the shape.
   * @param {THREE.Vector3} direction - The direction the shape should travel.
   * @param {THREE.Quaternion} cameraQuaternion - The orientation of the camera to align the shape with.
   */
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

  /**
   * Initializes the geometries and materials, and adds the shape to the scene.
   */
  init() {
    const geometries = PerfectShapeRenderer.getGeometries(this.shapeName);
    if (!geometries) return;
    const {lineGeom, fillGeom} = geometries;

    this.material = new THREE.LineBasicMaterial({
      color: 0x00ff00,
      linewidth: 5,
      depthTest: false,
      transparent: true,
      opacity: 1,
    });

    this.line = new THREE.Line(lineGeom, this.material);
    this.line.renderOrder = 999;

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

  /**
   * Updates the position and opacity of the shape based on elapsed time.
   * Disposes of the shape when it reaches its max age.
   * @param {number} delta - Time elapsed since the last frame in seconds.
   * @returns {boolean} True if the shape is still alive, false if it has been disposed.
   */
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

  /**
   * Removes the shape from the scene and disposes of its geometries and materials.
   */
  dispose() {
    if (!this.line) return;

    this.scene.remove(this.line);
    // Geometries are cached and shared, so we don't dispose them here.
    this.material.dispose();

    if (this.line.children.length > 0) {
      this.fillMaterial.dispose();
    }

    this.line = null;
  }

  /**
   * Helper to generate the shape path based on the shape name.
   * @param {string} name - The name of the shape.
   * @returns {THREE.Shape|null} The generated shape or null if the name is unknown.
   */
  static getShape(name) {
    const size = 0.05; // 5cm radius
    const shape = new THREE.Shape();

    switch (name) {
      case 'Circle':
        shape.absarc(0, 0, size, 0, Math.PI * 2, false);
        break;
      case 'Rectangle':
        shape.moveTo(-size * 1.5, -size);
        shape.lineTo(-size * 1.5, size);
        shape.lineTo(size * 1.5, size);
        shape.lineTo(size * 1.5, -size);
        shape.lineTo(-size * 1.5, -size);
        break;
      case 'Triangle':
        shape.moveTo(0, size);
        shape.lineTo(-size, -size);
        shape.lineTo(size, -size);
        shape.lineTo(0, size);
        break;
      case 'V':
        shape.moveTo(-size, size);
        shape.lineTo(0, -size);
        shape.lineTo(size, size);
        break;
      case 'Caret':
        shape.moveTo(-size, -size);
        shape.lineTo(0, size);
        shape.lineTo(size, -size);
        break;
      default:
        return null;
    }
    return shape;
  }

  /**
   * Generates both line (outline) and fill geometries for a given shape name.
   * @param {string} name - The name of the shape.
   * @returns {Object|null} An object containing lineGeom and fillGeom, or null if shape is unknown.
   */
  static getGeometries(name) {
    if (PerfectShapeRenderer.geometryCache.has(name)) {
      return PerfectShapeRenderer.geometryCache.get(name);
    }
    const shape = this.getShape(name);
    if (!shape) return null;
    // Generates line geometry.
    const points = name === 'Circle' ? shape.getPoints(32) : shape.getPoints();
    const lineGeom = new THREE.BufferGeometry().setFromPoints(points);
    // Generates fill geometry.
    if (name === 'V' || name === 'Caret') {
      shape.closePath();
    }
    const fillGeom = new THREE.ShapeGeometry(shape);
    const geometries = {lineGeom, fillGeom};
    PerfectShapeRenderer.geometryCache.set(name, geometries);
    return geometries;
  }
}
