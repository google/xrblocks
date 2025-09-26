import * as THREE from 'three';

import {lerp} from '../../utils/utils';
import {ReticleShader} from '../shaders/ReticleShader';

/**
 * A 3D visual marker used to indicate a user's aim or interaction
 * point in an XR scene. It orients itself to surfaces it intersects with and
 * provides visual feedback for states like "pressed".
 */
export class Reticle extends
    THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial> {
  /** Text description of the PanelMesh */
  name = 'Reticle';

  /** Prevents the reticle itself from being a target for raycasting. */
  ignoreReticleRaycast = true;

  /** The world-space direction vector of the ray that hit the target. */
  direction = new THREE.Vector3();

  /** Ensures the reticle is drawn on top of other transparent objects. */
  renderOrder = 1000;

  /** The smoothing factor for rotational slerp interpolation. */
  rotationSmoothing: number;

  /** The z-offset to prevent visual artifacts (z-fighting). */
  offset: number;

  /** The most recent intersection data that positioned this reticle. */
  intersection?: THREE.Intersection;

  /** Object on which the reticle is hovering. */
  targetObject?: THREE.Object3D;

  // --- Private properties for performance optimization ---
  private readonly originalNormal = new THREE.Vector3(0, 0, 1);
  private readonly newRotation = new THREE.Quaternion();
  private readonly objectRotation = new THREE.Quaternion();
  private readonly normalVector = new THREE.Vector3();

  /**
   * Creates an instance of Reticle.
   * @param rotationSmoothing - A factor between 0.0 (no smoothing) and
   * 1.0 (no movement) to smoothly animate orientation changes.
   * @param offset - A small z-axis offset to prevent z-fighting.
   * @param size - The radius of the reticle's circle geometry.
   * @param depthTest - Determines if the reticle should be occluded by other
   * objects. Defaults to `false` to ensure it is always visible.
   */
  constructor(
      rotationSmoothing = 0.8, offset = 0.001, size = 0.019,
      depthTest = false) {
    const geometry = new THREE.CircleGeometry(size, 32);
    geometry.applyMatrix4(new THREE.Matrix4().makeTranslation(0, 0, offset));

    super(geometry, new THREE.ShaderMaterial({
      uniforms: THREE.UniformsUtils.clone(ReticleShader.uniforms),
      vertexShader: ReticleShader.vertexShader,
      fragmentShader: ReticleShader.fragmentShader,
      depthTest: depthTest,
      transparent: true
    }));

    this.rotationSmoothing = rotationSmoothing;
    this.offset = offset;
  }

  /**
   * Orients the reticle to be flush with a surface, based on the surface
   * normal. It smoothly interpolates the rotation for a polished visual effect.
   * @param normal - The world-space normal of the surface.
   */
  setRotationFromNormalVector(normal: THREE.Vector3) {
    const angle = this.originalNormal.angleTo(normal);

    // Calculate the rotation axis by taking the cross product.
    // Note: this.originalNormal is modified here but reset by the next line.
    this.originalNormal.cross(normal).normalize();
    this.newRotation.setFromAxisAngle(this.originalNormal, angle);
    this.originalNormal.set(0, 0, 1);  // Reset for next use.

    // Smoothly interpolate from the current rotation to the new rotation.
    this.quaternion.slerp(this.newRotation, 1.0 - this.rotationSmoothing);
  }

  /**
   * Updates the reticle's complete pose (position and rotation) from a
   * raycaster intersection object.
   * @param intersection - The intersection data from a raycast.
   */
  setPoseFromIntersection(intersection: THREE.Intersection) {
    if (!intersection || !intersection.normal) return;

    this.intersection = intersection;
    this.position.copy(intersection.point);

    // The intersection normal is in the local space of the intersected object.
    // It must be transformed into world space to correctly orient the reticle.
    intersection.object.getWorldQuaternion(this.objectRotation);
    this.normalVector.copy(intersection.normal)
        .applyQuaternion(this.objectRotation);
    this.setRotationFromNormalVector(this.normalVector);
  }

  /**
   * Sets the color of the reticle via its shader uniform.
   * @param color - The color to apply.
   */
  setColor(color: THREE.Color|number|string) {
    this.material.uniforms.uColor.value.set(color);
  }

  /**
   * Gets the current color of the reticle.
   * @returns The current color from the shader uniform.
   */
  getColor(): THREE.Color {
    return this.material.uniforms.uColor.value;
  }

  /**
   * Sets the visual state of the reticle to "pressed" or "unpressed".
   * This provides visual feedback to the user during interaction.
   * @param pressed - True to show the pressed state, false otherwise.
   */
  setPressed(pressed: boolean) {
    this.material.uniforms.uPressed.value = pressed ? 1.0 : 0.0;
    this.scale.setScalar(pressed ? 0.7 : 1.0);
  }

  /**
   * Sets the pressed state as a continuous value for smooth animations.
   * @param pressedAmount - A value from 0.0 (unpressed) to 1.0 (fully
   * pressed).
   */
  setPressedAmount(pressedAmount: number) {
    this.material.uniforms.uPressed.value = pressedAmount;
    this.scale.setScalar(lerp(1.0, 0.7, pressedAmount));
  }

  /**
   * Overrides the default raycast method to make the reticle ignored by
   * raycasters.
   */
  raycast() {}
}
