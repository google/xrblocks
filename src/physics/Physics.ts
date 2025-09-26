import type RAPIER from 'rapier3d';

import {PhysicsOptions, RAPIERCompat} from './PhysicsOptions';

/**
 * Integrates the RAPIER physics engine into the XRCore lifecycle.
 * It sets up the physics in a blended world that combines virtual and physical
 * objects, steps the simulation forward in sync with the application's
 * framerate, and manages the lifecycle of physics-related objects.
 */
export class Physics {
  initialized = false;
  options?: PhysicsOptions;
  RAPIER!: RAPIERCompat;
  fps: number = 0;
  blendedWorld!: RAPIER.World;
  eventQueue!: RAPIER.EventQueue;

  get timestep() {
    return 1 / this.fps;
  }

  /**
   * Asynchronously initializes the RAPIER physics engine and creates the
   * blendedWorld. This is called in Core before the physics simulation starts.
   */
  async init({physicsOptions}: {physicsOptions: PhysicsOptions}) {
    this.options = physicsOptions;
    this.RAPIER = this.options.RAPIER!;
    this.fps = this.options.fps;
    if (this.RAPIER.init) {
      await this.RAPIER.init();
    }
    this.blendedWorld = new this.RAPIER!.World(this.options.gravity);
    this.blendedWorld.timestep = this.timestep;
    if (this.options.useEventQueue) {
      this.eventQueue = new this.RAPIER!.EventQueue(true);
    }
    this.initialized = true;
  }

  /**
   * Advances the physics simulation by one step.
   */
  physicsStep() {
    if (this.options?.worldStep && this.blendedWorld) {
      this.blendedWorld.step(this.eventQueue);
    }
  }

  /**
   * Frees the memory allocated by the RAPIER physics blendedWorld and event
   * queue. This is crucial for preventing memory leaks when the XR session
   * ends.
   */
  dispose() {
    if (this.eventQueue) {
      this.eventQueue.free();
    }
    if (this.blendedWorld) {
      this.blendedWorld.free();
    }
  }
};
