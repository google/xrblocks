import * as THREE from 'three';
/**
 * A 3D visual marker used to indicate a user's aim or interaction
 * point in an XR scene. It orients itself to surfaces it intersects with and
 * provides visual feedback for states like "pressed".
 */
export declare class Reticle extends THREE.Mesh<THREE.BufferGeometry, THREE.ShaderMaterial> {
    /** Text description of the PanelMesh */
    name: string;
    /** Prevents the reticle itself from being a target for raycasting. */
    ignoreReticleRaycast: boolean;
    /** The world-space direction vector of the ray that hit the target. */
    direction: THREE.Vector3;
    /** Ensures the reticle is drawn on top of other transparent objects. */
    renderOrder: number;
    /** The smoothing factor for rotational slerp interpolation. */
    rotationSmoothing: number;
    /** The z-offset to prevent visual artifacts (z-fighting). */
    offset: number;
    /** The most recent intersection data that positioned this reticle. */
    intersection?: THREE.Intersection;
    /** Object on which the reticle is hovering. */
    targetObject?: THREE.Object3D;
    private readonly originalNormal;
    private readonly newRotation;
    private readonly objectRotation;
    private readonly normalVector;
    /**
     * Creates an instance of Reticle.
     * @param rotationSmoothing - A factor between 0.0 (no smoothing) and
     * 1.0 (no movement) to smoothly animate orientation changes.
     * @param offset - A small z-axis offset to prevent z-fighting.
     * @param size - The radius of the reticle's circle geometry.
     * @param depthTest - Determines if the reticle should be occluded by other
     * objects. Defaults to `false` to ensure it is always visible.
     */
    constructor(rotationSmoothing?: number, offset?: number, size?: number, depthTest?: boolean);
    /**
     * Orients the reticle to be flush with a surface, based on the surface
     * normal. It smoothly interpolates the rotation for a polished visual effect.
     * @param normal - The world-space normal of the surface.
     */
    setRotationFromNormalVector(normal: THREE.Vector3): void;
    /**
     * Updates the reticle's complete pose (position and rotation) from a
     * raycaster intersection object.
     * @param intersection - The intersection data from a raycast.
     */
    setPoseFromIntersection(intersection: THREE.Intersection): void;
    /**
     * Sets the color of the reticle via its shader uniform.
     * @param color - The color to apply.
     */
    setColor(color: THREE.Color | number | string): void;
    /**
     * Gets the current color of the reticle.
     * @returns The current color from the shader uniform.
     */
    getColor(): THREE.Color;
    /**
     * Sets the visual state of the reticle to "pressed" or "unpressed".
     * This provides visual feedback to the user during interaction.
     * @param pressed - True to show the pressed state, false otherwise.
     */
    setPressed(pressed: boolean): void;
    /**
     * Sets the pressed state as a continuous value for smooth animations.
     * @param pressedAmount - A value from 0.0 (unpressed) to 1.0 (fully
     * pressed).
     */
    setPressedAmount(pressedAmount: number): void;
    /**
     * Overrides the default raycast method to make the reticle ignored by
     * raycasters.
     */
    raycast(): void;
}
