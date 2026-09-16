import * as THREE from 'three';

import {lerp} from '../../utils/utils';
import {ReticleShader} from './ReticleShader';

const HOVER_RING_BRIGHTNESS = 0.4;
const HOVER_RING_OPACITY = 0.7;
const RETICLE_RENDER_ORDER = 2_000_000_000;

export interface ReticleUniforms {
  [uniform: string]: THREE.IUniform;
  uColor: THREE.IUniform<THREE.Color>;
  uPressed: THREE.IUniform<number>;
}

/**
 * A 3D visual marker used to indicate a user's aim or interaction
 * point in an XR scene. It orients itself to surfaces it intersects with and
 * provides visual feedback for states like "pressed".
 */
export class Reticle extends THREE.Mesh<THREE.BufferGeometry, THREE.Material> {
  /** Text description of the PanelMesh */
  name = 'Reticle';
  editorIcon = 'target';

  /** The world-space direction vector of the ray that hit the target. */
  direction = new THREE.Vector3();

  /** Ensures the reticle is drawn on top of other transparent objects. */
  renderOrder = RETICLE_RENDER_ORDER;

  /** The smoothing factor for rotational slerp interpolation. */
  rotationSmoothing: number;

  /** The z-offset to prevent visual artifacts (z-fighting). */
  offset: number;

  /** The most recent intersection data that positioned this reticle. */
  intersection?: THREE.Intersection;

  /** Object on which the reticle is hovering. */
  targetObject?: THREE.Object3D;

  /** The uniforms driving this reticle's material. */
  readonly uniforms: ReticleUniforms;

  /** Whether depth test was requested for this reticle. */
  readonly depthTestEnabled: boolean;

  private syncUniforms?: () => void;

  /** Ring shown when the reticle is over an interactable object. */
  private readonly hoverRing: THREE.Mesh<
    THREE.RingGeometry,
    THREE.MeshBasicMaterial
  >;

  // --- Private properties for performance optimization ---
  private readonly originalNormal = new THREE.Vector3(0, 0, 1);
  private readonly newRotation = new THREE.Quaternion();
  private readonly objectRotation = new THREE.Quaternion();
  private readonly normalVector = new THREE.Vector3();

  /**
   * Creates an instance of Reticle.
   * @param innerRadius - Inner radius of the reticle ring geometry.
   * @param outerRadius - Outer radius of the reticle ring geometry.
   * @param depthTest - Determines if the reticle should be occluded by other
   * objects. Defaults to `false` to ensure it is always visible.
   */
  constructor(innerRadius = 0, outerRadius = 0.019, depthTest = false) {
    const uniforms: ReticleUniforms = {
      uColor: {value: new THREE.Color(0xffffff)},
      uPressed: {value: 0.0},
    };

    super(
      new THREE.RingGeometry(innerRadius, outerRadius, 32),
      new THREE.ShaderMaterial({
        uniforms,
        vertexShader: ReticleShader.vertexShader,
        fragmentShader: ReticleShader.fragmentShader,
        transparent: true,
        depthTest,
        depthWrite: false,
      })
    );

    this.uniforms = uniforms;

    this.depthTestEnabled = depthTest;
    this.rotationSmoothing = 0.8;
    this.offset = 0.001;

    this.hoverRing = new THREE.Mesh(
      new THREE.RingGeometry(outerRadius, outerRadius * 1.15, 32),
      new THREE.MeshBasicMaterial({
        color: getHoverRingColor(this.getColor()),
        depthTest,
        depthWrite: false,
        transparent: true,
        opacity: HOVER_RING_OPACITY,
      })
    );
    this.hoverRing.position.z = this.offset;
    this.hoverRing.renderOrder = this.renderOrder;
    this.hoverRing.visible = false;
    this.hoverRing.raycast = () => {};
    this.add(this.hoverRing);
  }

  /**
   * Replaces the reticle's primary material (e.g. with a WebGPU NodeMaterial)
   * and registers a callback to synchronize uniform changes.
   */
  setCustomMaterial(material: THREE.Material, syncUniforms?: () => void) {
    this.material.dispose();
    this.material = material;
    this.syncUniforms = syncUniforms;
    this.syncUniforms?.();
  }

  /**
   * Orients the reticle to be flush with a surface, based on the surface
   * normal. It smoothly interpolates the rotation for a polished visual effect.
   * @param normal - The world-space normal of the surface.
   */
  setRotationFromNormalVector(normal: THREE.Vector3) {
    this.normalVector.copy(normal).normalize();
    this.newRotation.setFromUnitVectors(this.originalNormal, this.normalVector);

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
    this.normalVector
      .copy(intersection.normal)
      .applyQuaternion(this.objectRotation);
    this.setRotationFromNormalVector(this.normalVector);
  }

  /**
   * Sets the color of the reticle via its shader uniform.
   * @param color - The color to apply.
   */
  setColor(color: THREE.Color | number | string) {
    this.uniforms.uColor.value.set(color);
    this.hoverRing.material.color.copy(
      getHoverRingColor(this.uniforms.uColor.value)
    );
    this.syncUniforms?.();
  }

  /**
   * Gets the current color of the reticle.
   * @returns The current color from the shader uniform.
   */
  getColor(): THREE.Color {
    return this.uniforms.uColor.value;
  }

  /**
   * Sets the visual state of the reticle to "pressed" or "unpressed".
   * This provides visual feedback to the user during interaction.
   * @param pressed - True to show the pressed state, false otherwise.
   */
  setPressed(pressed: boolean) {
    this.uniforms.uPressed.value = pressed ? 1.0 : 0.0;
    this.syncUniforms?.();
    this.scale.setScalar(pressed ? 0.7 : 1.0);
  }

  /**
   * Sets the pressed state as a continuous value for smooth animations.
   * @param pressedAmount - A value from 0.0 (unpressed) to 1.0 (fully
   * pressed).
   */
  setPressedAmount(pressedAmount: number) {
    this.uniforms.uPressed.value = pressedAmount;
    this.syncUniforms?.();
    this.scale.setScalar(lerp(1.0, 0.7, pressedAmount));
  }

  /**
   * Shows a ring around the reticle while it hovers over an interactable
   * object.
   */
  setHovering(hovering: boolean) {
    this.hoverRing.visible = hovering;
  }

  /** Releases the GPU resources owned by this Reticle. */
  dispose() {
    this.removeFromParent();
    this.geometry.dispose();
    this.material.dispose();
    this.hoverRing.geometry.dispose();
    this.hoverRing.material.dispose();
    this.intersection = undefined;
    this.targetObject = undefined;
    super.dispose();
  }

  /**
   * Overrides the default raycast method to make the reticle ignored by
   * raycasters.
   */
  raycast() {}
}

function getHoverRingColor(color: THREE.Color) {
  return color.clone().multiplyScalar(HOVER_RING_BRIGHTNESS);
}
