import * as THREE from 'three';

import {Script} from '../core/Script';
import {placeObjectAtIntersectionFacingTarget} from '../utils/ObjectPlacement';

import {ObjectDetector} from './objects/ObjectDetector';
import {PlaneDetector} from './planes/PlaneDetector';
import {WorldOptions} from './WorldOptions';
// Import other modules as they are implemented in future.
// import { SceneMesh } from '/depth/SceneMesh.js';
// import { LightEstimation } from '/lighting/LightEstimation.js';
// import { HumanRecognizer } from '/human/HumanRecognizer.js';

/**
 * Manages all interactions with the real-world environment perceived by the XR
 * device. This class abstracts the complexity of various perception APIs
 * (Depth, Planes, Meshes, etc.) and provides a simple, event-driven interface
 * for developers to use `this.world.depth.mesh`, `this.world.planes`.
 */
export class World extends Script {
  static dependencies = {
    options: WorldOptions,
    camera: THREE.Camera,
  };

  /**
   * Configuration options for all world-sensing features.
   */
  options!: WorldOptions;

  /**
   * The depth module instance. Null if not enabled.
   */
  // depth = null;

  /**
   * The light estimation module instance. Null if not enabled.
   */
  // lighting = null;

  /**
   * The plane detection module instance. Null if not enabled.
   * Not recommended for anchoring.
   */
  planes?: PlaneDetector;

  /**
   * The scene mesh module instance. Null if not enabled.
   * TODO: Not yet supported in Chrome.
   */
  // meshes = null;

  /**
   * The object recognition module instance. Null if not enabled.
   */
  objects?: ObjectDetector;

  /**
   * A Three.js Raycaster for performing intersection tests.
   */
  private raycaster = new THREE.Raycaster();

  private camera!: THREE.Camera;

  /**
   * Initializes the world-sensing modules based on the provided configuration.
   * This method is called automatically by the XRCore.
   */
  override async init({options, camera}:
                          {options: WorldOptions, camera: THREE.Camera}) {
    this.options = options;
    this.camera = camera;

    if (!this.options || !this.options.enabled) {
      return;
    }

    // Conditionally initialize each perception module based on options.
    if (this.options.planes.enabled) {
      this.planes = new PlaneDetector();
      this.add(this.planes);
    }

    if (this.options.objects.enabled) {
      this.objects = new ObjectDetector();
      this.add(this.objects);
    }


    // TODO: Initialize other modules as they are available & implemented.
    /*
    if (this.options.sceneMesh.enabled) {
      this.meshes = new SceneMesh();
    }

    if (this.options.lighting.enabled) {
      this.lighting = new LightEstimation();
    }

    if (this.options.humans.enabled) {
      this.humans = new HumanRecognizer();
    }
    */
  }

  /**
   * Places an object at the reticle.
   */
  anchorObjectAtReticle(_object: THREE.Object3D, _reticle: THREE.Object3D) {
    throw new Error('Method not implemented');
  }

  /**
   * Updates all active world-sensing modules with the latest XRFrame data.
   * This method is called automatically by the XRCore on each frame.
   * @param _timestamp - The timestamp for the current frame.
   * @param frame - The current XRFrame, containing environmental
   * data.
   * @override
   */
  update(_timestamp: number, frame?: XRFrame) {
    if (!this.options?.enabled || !frame) {
      return;
    }

    // Note: Object detection is not run per-frame by default as it's a
    // costly operation. It should be triggered manually via
    // `this.world.objects.runDetection()`.

    // TODO: Update other modules as they are available & implemented.
    // this.meshes?.update(frame);
    // this.lighting?.update(frame);
    // this.humans?.update(frame);
  }

  /**
   * Performs a raycast from a controller against detected real-world surfaces
   * (currently planes) and places a 3D object at the intersection point,
   * oriented to face the user.
   *
   * We recommend using /templates/3_depth/ to anchor objects based on
   * depth mesh for mixed reality experience for accuracy. This function is
   * design for demonstration purposes.
   *
   * @param objectToPlace - The object to position in the
   * world.
   * @param controller - The controller to use for raycasting.
   * @returns True if the object was successfully placed, false
   * otherwise.
   */
  placeOnSurface(objectToPlace: THREE.Object3D, controller: THREE.Object3D) {
    if (!this.planes) {
      console.warn('Cannot placeOnSurface: PlaneDetector is not enabled.');
      return false;
    }

    const allPlanes = this.planes.get();
    if (allPlanes.length === 0) {
      return false;  // No surfaces to cast against.
    }

    this.raycaster.setFromXRController(controller as THREE.XRTargetRaySpace);

    const intersections = this.raycaster.intersectObjects(allPlanes);

    if (intersections.length > 0) {
      const intersection = intersections[0];
      placeObjectAtIntersectionFacingTarget(
          objectToPlace, intersection, this.camera);
      return true;
    }

    return false;
  }

  /**
   * Toggles the visibility of all debug visualizations for world features.
   * @param visible - Whether the visualizations should be visible.
   */
  showDebugVisualizations(visible = true) {
    this.planes?.showDebugVisualizations(visible);
    this.objects?.showDebugVisualizations(visible);
    // this.meshes?.showDebugVisualizations(visible);
  }
}
