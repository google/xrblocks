import * as THREE from 'three';

import {Script} from '../../core/Script';
import {WorldOptions} from '../WorldOptions';

import {DetectedPlane} from './DetectedPlane';

/**
 * Detects and manages real-world planes provided by the WebXR Plane Detection
 * API. It creates, updates, and removes `Plane` mesh objects in the scene.
 */
export class PlaneDetector extends Script {
  static dependencies = {options: WorldOptions, renderer: THREE.WebGLRenderer};

  /**
   * A map from the WebXR `XRPlane` object to our custom `DetectedPlane` mesh.
   */
  private _detectedPlanes = new Map<XRPlane, DetectedPlane>();

  /**
   * The material used for visualizing planes when debugging.
   */
  private _debugMaterial!: THREE.Material;

  /**
   * The reference space used for poses.
   */
  private _xrRefSpace?: XRReferenceSpace;
  private renderer!: THREE.WebGLRenderer;

  /**
   * Initializes the PlaneDetector.
   */
  override init({options, renderer}:
                    {options: WorldOptions, renderer: THREE.WebGLRenderer}) {
    this.renderer = renderer;
    if (options.planes.showDebugVisualizations) {
      this._debugMaterial = new THREE.MeshBasicMaterial(
          {color: 0xffff00, wireframe: true, side: THREE.DoubleSide});
    }
  }

  /**
   * Processes the XRFrame to update plane information.
   */
  override update(_: number, frame: XRFrame) {
    if (!frame || !frame.detectedPlanes) return;

    this._xrRefSpace =
        this._xrRefSpace || this.renderer.xr.getReferenceSpace() || undefined;

    if (!this._xrRefSpace) return;

    const detectedPlanesInFrame = frame.detectedPlanes;
    const planesToRemove = new Set(this._detectedPlanes.keys());

    for (const xrPlane of detectedPlanesInFrame) {
      planesToRemove.delete(xrPlane);  // This plane is still active.

      const existingPlaneMesh = this._detectedPlanes.get(xrPlane);

      if (existingPlaneMesh) {
        // Plane already exists, check if it needs an update.
        if (xrPlane.lastChangedTime >
            (existingPlaneMesh.xrPlane.lastChangedTime || 0)) {
          this._updatePlaneMesh(frame, existingPlaneMesh, xrPlane);
        }
      } else {
        // This is a newly detected plane.
        this._addPlaneMesh(frame, xrPlane);
      }
    }

    // Remove planes that are no longer detected.
    for (const xrPlane of planesToRemove) {
      this._removePlaneMesh(xrPlane);
    }
  }

  /**
   * Creates and adds a new `Plane` mesh to the scene.
   * @param frame - WebXR frame.
   * @param xrPlane - The new WebXR plane object.
   */
  private _addPlaneMesh(frame: XRFrame, xrPlane: XRPlane) {
    const material =
        this._debugMaterial || new THREE.MeshBasicMaterial({visible: false});
    const planeMesh = new DetectedPlane(xrPlane, material);

    this._updatePlanePose(frame, planeMesh, xrPlane);

    this._detectedPlanes.set(xrPlane, planeMesh);
    this.add(planeMesh);
  }

  /**
   * Updates an existing `DetectedPlane` mesh's geometry and pose.
   * @param frame - WebXR frame.
   * @param planeMesh - The mesh to update.
   * @param xrPlane - The updated plane data.
   */
  private _updatePlaneMesh(
      frame: XRFrame, planeMesh: DetectedPlane, xrPlane: XRPlane) {
    // Recreate geometry from the new polygon.
    const newVertices = xrPlane.polygon.map(p => new THREE.Vector2(p.x, p.z));
    const newShape = new THREE.Shape(newVertices);
    const newGeometry = new THREE.ShapeGeometry(newShape);

    planeMesh.geometry.dispose();
    planeMesh.geometry = newGeometry;
    planeMesh.xrPlane = xrPlane;  // Update the reference.

    this._updatePlanePose(frame, planeMesh, xrPlane);
  }

  /**
   * Removes a `Plane` mesh from the scene and disposes of its resources.
   * @param xrPlane - The WebXR plane object to remove.
   */
  private _removePlaneMesh(xrPlane: XRPlane) {
    const planeMesh = this._detectedPlanes.get(xrPlane);
    if (planeMesh) {
      planeMesh.geometry.dispose();
      this.remove(planeMesh);
      this._detectedPlanes.delete(xrPlane);
    }
  }

  /**
   * Updates the position and orientation of a `DetectedPlane` mesh from its XR
   * pose.
   * @param frame - The current XRFrame.
   * @param planeMesh - The mesh to update.
   * @param xrPlane - The plane data with the pose.
   */
  private _updatePlanePose(
      frame: XRFrame, planeMesh: DetectedPlane, xrPlane: XRPlane) {
    const pose = frame.getPose(xrPlane.planeSpace, this._xrRefSpace!);
    if (pose) {
      planeMesh.position.copy(pose.transform.position);
      planeMesh.quaternion.copy(pose.transform.orientation);
    }
  }

  /**
   * Retrieves a list of detected planes, optionally filtered by a semantic
   * label.
   *
   * @param label - The semantic label to filter by (e.g.,
   *     'floor', 'wall').
   * If null or undefined, all detected planes are returned.
   * @returns An array of `DetectedPlane` objects
   *     matching the criteria.
   */
  get(label?: string) {
    const allPlanes = Array.from(this._detectedPlanes.values());
    if (!label) {
      return allPlanes;
    }
    return allPlanes.filter(plane => plane.label === label);
  }

  /**
   * Toggles the visibility of the debug meshes for all planes.
   * Requires `showDebugVisualizations` to be true in the options.
   * @param visible - Whether to show or hide the planes.
   */
  showDebugVisualizations(visible = true) {
    if (this._debugMaterial) {
      this.visible = visible;
    }
  }
}
