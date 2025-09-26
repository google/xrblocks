import * as THREE from 'three';
/**
 * A non-visual helper class for calculating a slider value based on
 * a controller's movement relative to an initial pose. It can derive the value
 * from either positional (for XR hands/controllers) or rotational (for mouse)
 * input, making it a flexible tool for creating virtual sliders without a
 * visible UI element.
 */
export declare class FreestandingSlider {
    startingValue: number;
    minValue: number;
    maxValue: number;
    scale: number;
    initialPosition: THREE.Vector3;
    initialRotationInverse: THREE.Quaternion;
    rotationScale: number;
    /**
     * Create a freestanding slider object.
     */
    constructor(startingValue?: number, minValue?: number, maxValue?: number, scale?: number, rotationScale?: number);
    /**
     * Captures the initial position and rotation to serve as the reference point
     * for the gesture.
     * @param position - The starting world position.
     * @param rotation - The starting world rotation.
     */
    setInitialPose(position: THREE.Vector3, rotation: THREE.Quaternion): void;
    /**
     * A convenience method to capture the initial pose from a controller object.
     * @param controller - The controller to use as the reference.
     */
    setInitialPoseFromController(controller: THREE.Object3D): void;
    /**
     * Calculates the slider value based on a new world position.
     * @param position - The current world position of the input source.
     * @returns The calculated slider value, clamped within the min/max range.
     */
    getValue(position: THREE.Vector3): number;
    /**
     * Calculates the slider value based on a new world rotation (for mouse
     * input).
     * @param rotation - The current world rotation of the input source.
     * @returns The calculated slider value, clamped within the min/max range.
     */
    getValueFromRotation(rotation: THREE.Quaternion): number;
    /**
     * A polymorphic method that automatically chooses the correct calculation
     * (positional or rotational) based on the controller type.
     * @param controller - The controller providing the input.
     * @returns The calculated slider value.
     */
    getValueFromController(controller: THREE.Object3D): number;
    /**
     * Updates the starting value, typically after a gesture has ended.
     * @param value - The new starting value for the next gesture.
     */
    updateValue(value: number): void;
}
