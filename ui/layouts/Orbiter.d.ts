import { Grid, GridOptions } from './Grid.js';
/**
 * A layout container designed to hold secondary UI elements, such
 * as an exit button or settings icon. It typically "orbits" or remains
 * attached to a corner of its parent panel, outside the main content area.
 */
export type OrbiterOptions = GridOptions;
export declare class Orbiter extends Grid {
    init(): void;
}
