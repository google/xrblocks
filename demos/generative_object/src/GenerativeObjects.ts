import * as THREE from 'three';
import {
  AI,
  Depth,
  OcclusionUtils,
  poseInFrontOfCamera,
  quaternionFacingCamera,
  Script,
} from 'xrblocks';

import {GenerativeObject} from './GenerativeObject.js';
import {GenerativeOptions} from './GenerativeOptions.js';
import {
  CanvasBackgroundTextureSource,
  DataUrlTextureSource,
  type TextureSource,
} from './TextureSource.js';

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
 * Demo helper that turns a text prompt into a placed, draggable
 * {@link GenerativeObject}: it asks the AI model to generate an image, decodes
 * it into a texture, and drops the result into the scene in front of the user.
 *
 * Lives in the demo (rather than the SDK) so the high-level shape can keep
 * evolving. The generation step is split into {@link generateBillboard}, an
 * image-to-placed-object primitive, to mirror where an SDK
 * `ai.generateBillboard(image)` could eventually sit.
 *
 * If AI is unavailable or generation yields no image, {@link imagine} resolves
 * to `null` instead of throwing.
 */
export class GenerativeObjects extends Script {
  static dependencies = {
    ai: AI,
    camera: THREE.Camera,
    scene: THREE.Scene,
    depth: Depth,
  };

  options = new GenerativeOptions();

  /** Decodes generated image data into a texture. Built from options on init. */
  textureSource: TextureSource = new DataUrlTextureSource();

  /** All objects created this session, in creation order. */
  readonly objects: GenerativeObject[] = [];

  private ai!: AI;
  private camera!: THREE.Camera;
  private scene!: THREE.Scene;
  private depth?: Depth;
  private raycaster = new THREE.Raycaster();
  // Per-object teardown that removes the object's occlusion shader from the
  // engine-wide depth.occludableShaders set, so cleared objects don't leak.
  private readonly shaderCleanups = new Map<GenerativeObject, () => void>();
  // Bumped whenever objects are cleared, so an in-flight imagine() that resolves
  // after a clear/teardown does not add a stale object to the scene.
  private generation = 0;

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
    this.textureSource = this.options.removeBackground
      ? new CanvasBackgroundTextureSource({
          buildDisplacement: this.options.relief,
        })
      : new DataUrlTextureSource();
  }

  /** Whether image generation can run in the current session. */
  get isSupported(): boolean {
    return !!this.ai?.isAvailable?.();
  }

  /** Billboards tracked objects toward the user each frame, when enabled. */
  override update() {
    this.markDepthMeshNonInteractive_();
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

  // Keep the depth mesh out of the reticle's hover/select raycast so that
  // standing close to a wall doesn't let it steal hover from the control panel.
  // ignoreReticleRaycast leaves the mesh's own .raycast intact, so
  // raycastSurface_ can still place objects on it.
  private markDepthMeshNonInteractive_() {
    const mesh = this.depth?.depthMesh;
    if (mesh) {
      mesh.ignoreReticleRaycast = true;
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

    return this.generateBillboard(result, prompt, options);
  }

  /**
   * Builds and places a draggable billboard from an already-generated image.
   * This is the image-to-object half of {@link imagine}, kept separate to model
   * the shape of a future `ai.generateBillboard(image)` primitive.
   * @param image - Image data (typically a `data:` URL).
   * @param prompt - Label describing the image, stored on the object.
   * @param options - Optional per-call placement overrides.
   * @returns The placed object, or `null` if it was cleared mid-load.
   */
  async generateBillboard(
    image: string,
    prompt = '',
    options: ImagineOptions = {}
  ): Promise<GenerativeObject | null> {
    const generation = this.generation;
    const loaded = await this.textureSource.load(image);
    // Dropped/cleared while the texture was decoding: discard so we never add a
    // stale object after a clearObjects()/teardown.
    if (generation !== this.generation) {
      loaded.texture.dispose();
      loaded.displacementTexture?.dispose();
      return null;
    }

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
   * shader must also sample it (mirrors `ModelViewer`). No-op when depth is not
   * enabled, so the object stays plainly visible instead of sampling an empty
   * occlusion map and rendering transparent.
   */
  private setupOcclusion_(object: GenerativeObject) {
    const depth = this.depth;
    if (!depth?.occludableShaders) {
      return;
    }
    const material = object.mesh.material;
    material.onBeforeCompile = (shader) => {
      OcclusionUtils.addOcclusionToShader(shader);
      depth.occludableShaders.add(shader);
      // Remember how to remove this shader so clearObjects() doesn't leak it.
      this.shaderCleanups.set(object, () =>
        depth.occludableShaders.delete(shader)
      );
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
    // Ignore far surfaces (e.g. a wall across the room): placing a small object
    // metres away makes it tiny and easy to miss. Fall back to in-front
    // placement by returning null when the hit is beyond the comfortable reach.
    if (hit.distance > this.options.maxGroundDistance) {
      return null;
    }
    const point = hit.point.clone();
    // Prefer the triangle's geometric face normal: the depth mesh does not keep
    // per-vertex normals fresh, so the interpolated hit.normal can be stale,
    // whereas the face normal is derived from the current vertex positions.
    const local = hit.face?.normal ?? hit.normal ?? WORLD_UP;
    const normal = local
      .clone()
      .transformDirection(depthMesh.matrixWorld)
      .normalize();
    return {point, normal};
  }

  /** Removes all generated objects from the scene and frees their resources. */
  clearObjects() {
    // Invalidate any in-flight generateBillboard() so its result is discarded.
    this.generation++;
    for (const object of this.objects) {
      this.scene.remove(object);
      this.shaderCleanups.get(object)?.();
      this.shaderCleanups.delete(object);
      object.dispose();
    }
    this.objects.length = 0;
  }
}
