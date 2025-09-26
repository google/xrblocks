import {Grid, GridOptions} from './Grid.js';

/**
 * A layout component used within a `Grid` to arrange child elements
 * horizontally. The width of each column is determined by its `weight` property
 * relative to the total weight of all columns in the same row.
 */
export type ColOptions = GridOptions&{
  weight?: number;
};

export class Col extends Grid {
  constructor(options: ColOptions = {}) {
    if (options.weight === undefined) {
      options.weight = 0.5;
    }
    super(options);
  }
}
