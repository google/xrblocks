import * as THREE from 'three';

/**
 * Represents a single detected plane in the XR environment. It's a THREE.Mesh
 * that also holds metadata about the plane's properties.
 * Note: This requires experimental flag for Chrome.
 */
export class DetectedPlane extends THREE.Mesh {
  /**
   * The underlying XRPlane object from the WebXR API.
   * @see https://immersive-web.github.io/real-world-geometry/plane-detection.html#xrplane
   */
  xrPlane: XRPlane;

  /**
   * A semantic label for the plane (e.g., 'floor', 'wall', 'ceiling', 'table').
   * Since xrPlane.semanticLabel is readonly, this allows user authoring.
   */
  label: string;

  /**
   * The orientation of the plane ('Horizontal' or 'Vertical').
   */
  orientation: XRPlaneOrientation;

  /**
   * @param xrPlane - The plane object from the WebXR API.
   * @param material - The material for the mesh.
   */
  constructor(xrPlane: XRPlane, material: THREE.Material) {
    // Create geometry from the plane's polygon points.
    const planePolygon = xrPlane.polygon;
    const vertices = [];
    for (const point of planePolygon) {
      vertices.push(new THREE.Vector2(point.x, point.z));
    }
    const shape = new THREE.Shape(vertices);
    const geometry = new THREE.ShapeGeometry(shape);

    // ShapeGeometry creates a mesh in the XY plane by default.
    // We must rotate it to lie flat in the XZ plane to correctly represent
    // horizontal surfaces before applying the world pose provided by the API.
    geometry.rotateX(Math.PI / 2);

    super(geometry, material);

    this.xrPlane = xrPlane;
    this.label = xrPlane.semanticLabel || 'unknown';
    this.orientation = xrPlane.orientation;
  }
};
