import {Grid, GridOptions} from './Grid.js';

/**
 * A layout container designed to hold secondary UI elements, such
 * as an exit button or settings icon. It typically "orbits" or remains
 * attached to a corner of its parent panel, outside the main content area.
 */
export type OrbiterOptions = GridOptions;

export class Orbiter extends Grid {
  init() {
    super.init();

    this.position.set(-0.45 * this.rangeX, 0.7 * this.rangeY, this.position.z);
    this.scale.set(0.2, 0.2, 1.0);
  }
}
