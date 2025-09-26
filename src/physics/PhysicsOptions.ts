import type RAPIER from 'rapier3d';

export type RAPIERCompat = typeof RAPIER&{
  init?: () => Promise<void>;
}

export class PhysicsOptions {
  /**
   * The target frames per second for the physics simulation loop.
   */
  fps = 45;

  /**
   * The global gravity vector applied to the physics world.
   */
  gravity = {x: 0.0, y: -9.81, z: 0.0};

  /**
   * If true, the `Physics` manager will automatically call `world.step()`
   * on its fixed interval. Set to false if you want to control the
   * simulation step manually.
   */
  worldStep = true;

  /**
   * If true, an event queue will be created and passed to `world.step()`,
   * enabling the handling of collision and contact events.
   */
  useEventQueue = false

  /**
   * Instance of RAPIER.
   */
  RAPIER?: RAPIERCompat;
}
