import type RAPIER from 'rapier3d';
export type RAPIERCompat = typeof RAPIER & {
    init?: () => Promise<void>;
};
export declare class PhysicsOptions {
    /**
     * The target frames per second for the physics simulation loop.
     */
    fps: number;
    /**
     * The global gravity vector applied to the physics world.
     */
    gravity: {
        x: number;
        y: number;
        z: number;
    };
    /**
     * If true, the `Physics` manager will automatically call `world.step()`
     * on its fixed interval. Set to false if you want to control the
     * simulation step manually.
     */
    worldStep: boolean;
    /**
     * If true, an event queue will be created and passed to `world.step()`,
     * enabling the handling of collision and contact events.
     */
    useEventQueue: boolean;
    /**
     * Instance of RAPIER.
     */
    RAPIER?: RAPIERCompat;
}
