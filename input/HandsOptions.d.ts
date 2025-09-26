import { DeepPartial, DeepReadonly } from '../utils/Types';
export declare class HandsOptions {
    /** Whether hand tracking is enabled. */
    enabled: boolean;
    /** Whether to show any hand visualization. */
    visualization: boolean;
    /** Whether to show the tracked hand joints. */
    visualizeJoints: boolean;
    /** Whether to show the virtual hand meshes. */
    visualizeMeshes: boolean;
    debugging: boolean;
    constructor(options?: DeepReadonly<DeepPartial<HandsOptions>>);
    /**
     * Enables hands tracking.
     * @returns The instance for chaining.
     */
    enableHands(): this;
    enableHandsVisualization(): this;
}
