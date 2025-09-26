import * as THREE from 'three';
import { Script } from '../core/Script';
import { Reticle } from '../ui/core/Reticle';
import { AnimatableNumber } from '../ui/interaction/AnimatableNumber';
import { Controller } from './Controller';
interface GazeControllerEventMap extends THREE.Object3DEventMap {
    connected: {
        target: GazeController;
    };
    disconnected: {
        target: GazeController;
    };
    selectstart: {
        target: GazeController;
    };
    selectend: {
        target: GazeController;
    };
}
/**
 * Implements a gaze-based controller for XR interactions.
 * This allows users to select objects by looking at them for a set duration.
 * It functions as a virtual controller that is always aligned with the user's
 * camera (head pose).
 * WebXR Eye Tracking is not yet available. This API simulates a reticle
 * at the center of the field of view for simulating gaze-based interaction.
 */
export declare class GazeController extends Script<GazeControllerEventMap> implements Controller {
    static dependencies: {
        camera: typeof THREE.Camera;
    };
    /**
     * User data for the controller, including its connection status, unique ID,
     * and selection state.
     */
    userData: {
        connected: boolean;
        id: number;
        selected: boolean;
    };
    /**
     * The visual indicator for where the user is looking.
     */
    reticle: Reticle;
    /**
     * The time in seconds the user must gaze at an object to trigger a selection.
     */
    activationTimeSeconds: number;
    /**
     * An animatable number that tracks the progress of the gaze selection, from
     * 0.0 to 1.0.
     */
    activationAmount: AnimatableNumber;
    /**
     * Stores the reticle's position from the previous frame to calculate movement
     * speed.
     */
    lastReticlePosition: THREE.Vector3;
    /**
     * A clock to measure the time delta between frames for smooth animation and
     * movement calculation.
     */
    clock: THREE.Clock;
    camera: THREE.Camera;
    init({ camera }: {
        camera: THREE.Camera;
    }): void;
    /**
     * The main update loop, called every frame by the core engine.
     * It handles syncing the controller with the camera and manages the gaze
     * selection logic.
     */
    update(): void;
    /**
     * Updates the reticle's scale and shader uniforms to provide visual feedback
     * for gaze activation. The reticle shrinks and fills in as the activation
     * timer progresses.
     */
    updateReticleScale(): void;
    /**
     * Dispatches a 'selectstart' event, signaling that a gaze selection has been
     * initiated.
     */
    callSelectStart(): void;
    /**
     * Dispatches a 'selectend' event, signaling that a gaze selection has been
     * released (e.g., by moving gaze).
     */
    callSelectEnd(): void;
    /**
     * Connects the gaze controller to the input system.
     */
    connect(): void;
    /**
     * Disconnects the gaze controller from the input system.
     */
    disconnect(): void;
}
export {};
