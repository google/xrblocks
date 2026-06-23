import * as THREE from 'three';

import {AI} from '../ai/AI';
import {Script} from '../core/Script';

import {GenerativeObject} from './GenerativeObject';
import {GenerativeOptions} from './GenerativeOptions';
import {
  poseInFrontOfCamera,
  quaternionFacingCamera,
} from './GenerativeObjectUtils';
import {DataUrlTextureSource, TextureSource} from './TextureSource';

const scratchCameraPosition = new THREE.Vector3();

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
  };

  options = new GenerativeOptions();

  /** Decodes generated image data into a texture. Swappable for testing. */
  textureSource: TextureSource = new DataUrlTextureSource();

  /** All objects created this session, in creation order. */
  readonly objects: GenerativeObject[] = [];

  private ai!: AI;
  private camera!: THREE.Camera;
  private scene!: THREE.Scene;

  init({
    ai,
    camera,
    scene,
  }: {
    ai: AI;
    camera: THREE.Camera;
    scene: THREE.Scene;
  }) {
    this.ai = ai;
    this.camera = camera;
    this.scene = scene;
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
    const {position, quaternion} = poseInFrontOfCamera(this.camera, distance);
    object.position.copy(position);
    object.quaternion.copy(quaternion);

    this.scene.add(object);
    this.objects.push(object);
    return object;
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
