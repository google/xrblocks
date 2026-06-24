import * as THREE from 'three';

import {AI} from '../ai/AI';
import {Script} from '../core/Script';
import {Depth} from '../depth/Depth';
import {OcclusionUtils} from '../depth/occlusion/OcclusionUtils';

import {GenerativeObject} from './GenerativeObject';
import {GenerativeOptions} from './GenerativeOptions';
import {
  poseInFrontOfCamera,
  quaternionFacingCamera,
} from './GenerativeObjectUtils';
import {DataUrlTextureSource, TextureSource} from './TextureSource';

const scratchCameraPosition = new THREE.Vector3();
const scratchOrigin = new THREE.Vector3();
const scratchDirection = new THREE.Vector3();
const WORLD_UP = new THREE.Vector3(0, 1, 0);
/** Clearance in meters to float an object off a vertical surface. */
const SURFACE_CLEARANCE = 0.08;

/** Per-call overrides for {@link GenerativeObjects.imagine}. */
export interface ImagineOptions {
  /** Distance in meters in front of the user. Defaults to the options value. */
  distance?: number;
  /** Largest dimension of the object in meters. Defaults to the options value. */
  maxSize?: number;
}

/**
 * Subsystem that turns a text prompt into a placed, draggable
 * {@link GenerativeObject}: it asks the AI model to generate an image, decodes
 * it into a texture, and drops the result into the scene in front of the user.
 *
 * Every step degrades gracefully: if AI is unavailable or generation yields no
 * image, {@link imagine} resolves to `null` instead of throwing.
 */
export class GenerativeObjects extends Script {
  static dependencies = {
    ai: AI,
    camera: THREE.Camera,
    scene: THREE.Scene,
    depth: Depth,
  };

  options = new GenerativeOptions();

  /** Decodes generated image data into a texture. Swappable for testing. */
  textureSource: TextureSource = new DataUrlTextureSource();

  /** All objects created this session, in creation order. */
  readonly objects: GenerativeObject[] = [];

  private ai!: AI;
  private camera!: THREE.Camera;
  private scene!: THREE.Scene;
  private depth?: Depth;
  private raycaster = new THREE.Raycaster();

  init({
    ai,
    camera,
    scene,
    depth,
  }: {
    ai: AI;
    camera: THREE.Camera;
    scene: THREE.Scene;
    depth?: Depth;
  }) {
    this.ai = ai;
    this.camera = camera;
    this.scene = scene;
    this.depth = depth;
  }

  /** Whether image generation can run in the current session. */
  get isSupported(): boolean {
    return !!this.ai?.isAvailable?.();
  }

  /** Billboards tracked objects toward the user each frame, when enabled. */
  override update() {
    if (!this.options.billboard || this.objects.length === 0) {
      return;
    }
    const cameraPosition = this.camera.getWorldPosition(scratchCameraPosition);
    for (const object of this.objects) {
      quaternionFacingCamera(
        object.position,
        cameraPosition,
        object.quaternion
      );
    }
  }

  /**
   * Generates an image for `prompt` and places it as a draggable object in
   * front of the user.
   * @param prompt - What to generate, e.g. "a small red dragon".
   * @param options - Optional per-call placement overrides.
   * @returns The placed object, or `null` if generation was unavailable or
   *     produced no image.
   */
  async imagine(
    prompt: string,
    options: ImagineOptions = {}
  ): Promise<GenerativeObject | null> {
    if (!this.isSupported) {
      return null;
    }

    const result = await this.ai.generate(
      prompt,
      'image',
      this.options.systemInstruction
    );
    if (typeof result !== 'string' || result.length === 0) {
      return null;
    }

    const loaded = await this.textureSource.load(result);
    const maxSize = options.maxSize ?? this.options.maxSize;
    const distance = options.distance ?? this.options.distance;

    const object = new GenerativeObject(prompt, loaded, {
      maxSize,
      relief: this.options.relief,
      reliefStrength: this.options.reliefStrength,
      reliefSegments: this.options.reliefSegments,
    });
    this.setupOcclusion_(object);
    this.placeObject_(object, distance);

    this.scene.add(object);
    this.objects.push(object);
    return object;
  }

  /**
   * Makes the object's material occluded by the real-world depth mesh: enabling
   * the occludable layer alone only builds the occlusion mask, so the material's
   * shader must also sample it (mirrors `ModelViewer`).
   */
  private setupOcclusion_(object: GenerativeObject) {
    const depth = this.depth;
    if (!depth) {
      return;
    }
    const material = object.mesh.material;
    material.onBeforeCompile = (shader) => {
      OcclusionUtils.addOcclusionToShader(shader);
      depth.occludableShaders.add(shader);
    };
    material.needsUpdate = true;
  }

  /**
   * Positions a freshly built object: on the real-world surface the user is
   * looking at when grounding is enabled and a hit is found, otherwise in front
   * of the camera. Stands on horizontal surfaces and floats a little off
   * vertical ones so it never blends into a wall. Always upright toward the user.
   */
  private placeObject_(object: GenerativeObject, distance: number) {
    const hit = this.options.groundOnSurface ? this.raycastSurface_() : null;
    if (hit) {
      const isHorizontal = Math.abs(hit.normal.dot(WORLD_UP)) > 0.7;
      if (isHorizontal) {
        // Stand the cutout on the surface by lifting it half its height.
        const halfHeight = object.mesh.scale.y / 2;
        object.position.copy(hit.point).addScaledVector(WORLD_UP, halfHeight);
      } else {
        // Float it off the vertical surface so it doesn't z-fight / blend in.
        object.position
          .copy(hit.point)
          .addScaledVector(hit.normal, SURFACE_CLEARANCE);
      }
    } else {
      poseInFrontOfCamera(this.camera, distance, object.position);
    }
    const cameraPosition = this.camera.getWorldPosition(scratchCameraPosition);
    quaternionFacingCamera(object.position, cameraPosition, object.quaternion);
  }

  /**
   * Raycasts from the camera forward against the depth mesh.
   * @returns The world-space hit point and surface normal, or `null` if there is
   *     no depth mesh or no intersection.
   */
  protected raycastSurface_(): {
    point: THREE.Vector3;
    normal: THREE.Vector3;
  } | null {
    const depthMesh = this.depth?.depthMesh;
    if (!depthMesh) {
      return null;
    }
    const origin = this.camera.getWorldPosition(scratchOrigin);
    const direction = this.camera.getWorldDirection(scratchDirection);
    this.raycaster.set(origin, direction);
    const intersections = this.raycaster.intersectObject(depthMesh, false);
    if (intersections.length === 0) {
      return null;
    }
    const hit = intersections[0];
    const point = hit.point.clone();
    // Intersection normals are in the mesh's local space; bring to world space.
    const normal = (hit.normal ?? WORLD_UP)
      .clone()
      .transformDirection(depthMesh.matrixWorld)
      .normalize();
    return {point, normal};
  }

  /** Removes all generated objects from the scene and frees their resources. */
  clearObjects() {
    for (const object of this.objects) {
      this.scene.remove(object);
      object.dispose();
    }
    this.objects.length = 0;
  }
}
