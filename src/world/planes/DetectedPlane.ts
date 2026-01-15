import * as THREE from 'three';
import {SimulatorPlane} from './SimulatorPlane';

/**
 * Represents a single detected plane in the XR environment. It's a THREE.Mesh
 * that also holds metadata about the plane's properties.
 * Note: This requires chrome://flags/#openxr-spatial-entities to be enabled.
 */
export class DetectedPlane extends THREE.Mesh {
  /**
   * A semantic label for the plane (e.g., 'floor', 'wall', 'ceiling', 'table').
   * Since xrPlane.semanticLabel is readonly, this allows user authoring.
   */
  label?: string;

  /**
   * The orientation of the plane ('Horizontal' or 'Vertical').
   */
  orientation?: XRPlaneOrientation;

  /**
   * @param xrPlane - The plane object from the WebXR API.
   * @param material - The material for the mesh.
   */
  constructor(
    public xrPlane: XRPlane | null,
    material: THREE.Material,
    public simulatorPlane?: SimulatorPlane
  ) {
    let geometry;
    if (xrPlane) {
      // Create geometry from the plane's polygon points.
      const planePolygon = xrPlane.polygon;
      const vertices = [];
      for (const point of planePolygon) {
        vertices.push(new THREE.Vector2(point.x, point.z));
      }
      const shape = new THREE.Shape(vertices);
      geometry = new THREE.ShapeGeometry(shape);

      // ShapeGeometry creates a mesh in the XY plane by default.
      // We must rotate it to lie flat in the XZ plane to correctly represent
      // horizontal surfaces before applying the world pose provided by the API.
      geometry.rotateX(Math.PI / 2);
    } else if (simulatorPlane) {
      const shape = new THREE.Shape(simulatorPlane.polygon);
      geometry = new THREE.ShapeGeometry(shape);

      // ShapeGeometry creates a mesh in the XY plane by default.
      // We must rotate it to lie flat in the XZ plane to correctly represent
      // horizontal surfaces before applying the world pose provided by the API.
      geometry.rotateX(Math.PI / 2);
    }
    super(geometry, material);
    if (xrPlane) {
      this.label = xrPlane.semanticLabel;
      this.orientation = xrPlane.orientation;
    } else if (simulatorPlane) {
      this.label = simulatorPlane.type;
      this.orientation = simulatorPlane.type;
      this.position.copy(simulatorPlane.position);
      this.quaternion.copy(simulatorPlane.quaternion);
    }
  }
}
