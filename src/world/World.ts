import * as THREE from 'three';

import {Script} from '../core/Script';
import {WaitFrame} from '../core/components/WaitFrame';
import {placeObjectAtIntersectionFacingTarget} from '../utils/ObjectPlacement';

import {ObjectDetector} from './objects/ObjectDetector';
import {PlaneDetector} from './planes/PlaneDetector';
import {WorldOptions} from './WorldOptions';
import {MeshDetector} from './mesh/MeshDetector';
import {SoundDetector} from './sounds/SoundDetector';
import {placeOnHorizontalSurface} from './HorizontalPlacement';

// Import other modules as they are implemented in future.
// import { LightEstimation } from '/lighting/LightEstimation.js';
import {HumanRecognizer} from './humans/HumanRecognizer';
import {FaceRecognizer} from './faces/FaceRecognizer';

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
    waitFrame: WaitFrame,
    timer: THREE.Timer,
  };

  editorIcon = 'sensors';

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
   * The object recognition module instance. Null if not enabled.
   */
  objects?: ObjectDetector;

  /**
   * The mesh detection module instance. Null if not enabled.
   */
  meshes?: MeshDetector;

  /**
   * The sound detection module instance. Null if not enabled.
   */
  sounds?: SoundDetector;

  /**
   * The human recognition/pose module instance. Null if not enabled.
   */
  humans?: HumanRecognizer;

  /**
   * The face landmark detection module instance. Null if not enabled.
   */
  faces?: FaceRecognizer;

  /**
   * A Three.js Raycaster for performing intersection tests.
   */
  private raycaster = new THREE.Raycaster();

  private camera!: THREE.Camera;
  private waitFrame!: WaitFrame;
  private timer!: THREE.Timer;

  // Whether we need to initiate a room capture.
  private needsRoomCapture = false;

  private resolveInitialized!: () => void;
  readonly initializedPromise = new Promise<void>((resolve) => {
    this.resolveInitialized = resolve;
  });

  /**
   * Initializes the world-sensing modules based on the provided configuration.
   * This method is called automatically by the XRCore.
   */
  override async init({
    options,
    camera,
    waitFrame,
    timer,
  }: {
    options: WorldOptions;
    camera: THREE.Camera;
    waitFrame: WaitFrame;
    timer: THREE.Timer;
  }) {
    this.options = options;
    this.camera = camera;
    this.waitFrame = waitFrame;
    this.timer = timer;

    if (!this.options || !this.options.enabled) {
      this.resolveInitialized();
      return;
    }

    this.needsRoomCapture = this.options.initiateRoomCapture;

    // Conditionally initialize each perception module based on options.
    if (this.options.planes.enabled) {
      this.planes = new PlaneDetector();
      this.add(this.planes);
    }

    if (this.options.objects.enabled) {
      this.objects = new ObjectDetector();
      this.add(this.objects);
    }

    if (this.options.meshes.enabled) {
      this.meshes = new MeshDetector();
      this.add(this.meshes);
    }

    if (this.options.sounds.enabled) {
      this.sounds = new SoundDetector();
      this.add(this.sounds);
    }

    if (this.options.humans.enabled) {
      this.humans = new HumanRecognizer();
      this.add(this.humans);
    }

    if (this.options.faces.enabled) {
      this.faces = new FaceRecognizer();
      this.add(this.faces);
    }

    // TODO: Initialize other modules as they are available & implemented.
    /*

    if (this.options.lighting.enabled) {
      this.lighting = new LightEstimation();
    }
    */
    this.resolveInitialized();
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

    if (this.needsRoomCapture && frame.session.initiateRoomCapture) {
      this.needsRoomCapture = false;
      frame.session.initiateRoomCapture();
    }

    this.meshes?.updateMeshes(_timestamp, frame);
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
      return false; // No surfaces to cast against.
    }

    this.raycaster.setFromXRController(controller as THREE.XRTargetRaySpace);

    const intersections = this.raycaster.intersectObjects(allPlanes);

    if (intersections.length > 0) {
      const intersection = intersections[0];
      placeObjectAtIntersectionFacingTarget(
        objectToPlace,
        intersection,
        this.camera
      );
      return true;
    }

    return false;
  }

  /**
   * Places an object onto a suitable horizontal plane in the environment.
   * It prioritizes planes in front of the user, prefers tables/elevated surfaces over floors,
   * and ensures the object does not intersect other existing objects or other planes in the scene.
   * If placement fails in the current frame, it continues retrying frame-by-frame until the timeout is reached.
   *
   * @param objectToPlace - The Three.js Object3D to place.
   * @param timeout - Optional timeout duration as a Temporal.Duration or Temporal.DurationLike object (defaults to 500ms).
   * @param gridSteps - Optional number of steps along each axis for grid sampling candidate positions (defaults to 5).
   * @returns A promise resolving to true if successfully placed, false otherwise.
   */
  async placeOnHorizontalSurface(
    objectToPlace: THREE.Object3D,
    timeout: Temporal.Duration | Temporal.DurationLike = {milliseconds: 500},
    gridSteps: number = 9
  ): Promise<boolean> {
    // Wait for World script initialization to complete first
    await this.initializedPromise;

    // Walk up parent hierarchy to find the root THREE.Scene
    let sceneObj: THREE.Object3D | null = this.parent;
    while (sceneObj && !(sceneObj instanceof THREE.Scene)) {
      sceneObj = sceneObj.parent;
    }
    const rootScene = (sceneObj as THREE.Scene) || this;

    return placeOnHorizontalSurface(
      objectToPlace,
      this.camera,
      rootScene,
      this.planes,
      this.meshes,
      this.waitFrame,
      this.timer,
      timeout,
      gridSteps
    );
  }

  /**
   * Toggles the visibility of all debug visualizations for world features.
   * @param visible - Whether the visualizations should be visible.
   */
  showDebugVisualizations(visible = true) {
    this.planes?.showDebugVisualizations(visible);
    this.objects?.showDebugVisualizations(visible);
  }
}
