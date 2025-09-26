import {Grid, GridOptions} from './Grid.js';

/**
 * A layout component used within a `Grid` to arrange child elements
 * vertically. The height of each row is determined by its `weight` property
 * relative to the total weight of all rows in the grid.
 */
export type RowOptions = GridOptions&{
  weight?: number;
};

export class Row extends Grid {
  constructor(options: RowOptions = {}) {
    if (options.weight === undefined) {
      options.weight = 0.5;
    }
    super(options);
  }
}
