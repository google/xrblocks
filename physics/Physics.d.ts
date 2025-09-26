import type RAPIER from 'rapier3d';
import { PhysicsOptions, RAPIERCompat } from './PhysicsOptions';
/**
 * Integrates the RAPIER physics engine into the XRCore lifecycle.
 * It sets up the physics in a blended world that combines virtual and physical
 * objects, steps the simulation forward in sync with the application's
 * framerate, and manages the lifecycle of physics-related objects.
 */
export declare class Physics {
    initialized: boolean;
    options?: PhysicsOptions;
    RAPIER: RAPIERCompat;
    fps: number;
    blendedWorld: RAPIER.World;
    eventQueue: RAPIER.EventQueue;
    get timestep(): number;
    /**
     * Asynchronously initializes the RAPIER physics engine and creates the
     * blendedWorld. This is called in Core before the physics simulation starts.
     */
    init({ physicsOptions }: {
        physicsOptions: PhysicsOptions;
    }): Promise<void>;
    /**
     * Advances the physics simulation by one step.
     */
    physicsStep(): void;
    /**
     * Frees the memory allocated by the RAPIER physics blendedWorld and event
     * queue. This is crucial for preventing memory leaks when the XR session
     * ends.
     */
    dispose(): void;
}
