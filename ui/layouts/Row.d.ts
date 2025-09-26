import { Grid, GridOptions } from './Grid.js';
/**
 * A layout component used within a `Grid` to arrange child elements
 * vertically. The height of each row is determined by its `weight` property
 * relative to the total weight of all rows in the grid.
 */
export type RowOptions = GridOptions & {
    weight?: number;
};
export declare class Row extends Grid {
    constructor(options?: RowOptions);
}
